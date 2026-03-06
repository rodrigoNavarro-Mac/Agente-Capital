# Documentación del Bot de WhatsApp

Documentación extensa y detallada del flujo, arquitectura y comportamiento del bot de WhatsApp del proyecto Agente (multi-desarrollo, calificación de leads).

---

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura y flujo de datos](#2-arquitectura-y-flujo-de-datos)
3. [Webhook (entrada)](#3-webhook-entrada)
4. [Routing multi-desarrollo](#4-routing-multi-desarrollo)
5. [Estado de conversación y persistencia](#5-estado-de-conversación-y-persistencia)
6. [Máquina de estados (FSM)](#6-máquina-de-estados-fsm)
7. [Clasificación de intenciones (LLM)](#7-clasificación-de-intenciones-llm)
8. [LLM Response Selector](#8-llm-response-selector)
9. [FAQ Router y keywords](#9-faq-router-y-keywords)
10. [Context Extractor (Anthropic)](#10-context-extractor-anthropic)
11. [Historial de transiciones de estado](#11-historial-de-transiciones-de-estado)
12. [Contenido y medios por desarrollo](#12-contenido-y-medios-por-desarrollo)
13. [Envío de mensajes (salida)](#13-envío-de-mensajes-salida)
14. [Bridge WhatsApp-Cliq (Zoho Cliq)](#14-bridge-whatsapp-cliq-zoho-cliq)
15. [Limitaciones actuales y extensiones futuras](#15-limitaciones-actuales-y-extensiones-futuras)
16. [Despliegue en Vercel (serverless)](#16-despliegue-en-vercel-serverless)
17. [Solución de problemas](#17-solución-de-problemas)

---

## 1. Visión general

El bot es un **asistente conversacional por WhatsApp** que:

- Atiende **varios desarrollos inmobiliarios** (FUEGO, AMURA, PUNTO_TIERRA) desde **una sola aplicación**.
- El **número de WhatsApp** al que escribe el usuario determina el **desarrollo**; los mensajes, la imagen hero y el brochure PDF se eligen según ese desarrollo.
- Tiene un **flujo guiado (FSM)** para calificar leads: bienvenida, filtro de intención (comprar/invertir/solo info), CTA (visita o llamada), solicitud de nombre y handover a asesor.
- Persiste el **estado de cada conversación** por usuario y desarrollo en PostgreSQL.
- Envía **texto**, **imagen** (hero del desarrollo) y **documento PDF** (brochure) cuando están configurados.
- Usa **LLM** para clasificar intención (comprar / invertir / solo_info) y acción (cita / visita / cotización).

La API utilizada es **WhatsApp Cloud API** (Meta). El backend expone un único endpoint de webhook que recibe los eventos y responde enviando mensajes mediante el cliente HTTP a la API de Meta.

---

## 2. Arquitectura y flujo de datos

### Diagrama de flujo (alto nivel)

```
Usuario escribe en WhatsApp
         |
         v
WhatsApp Cloud API envía POST al webhook (Next.js)
         |
         v
+------------------------------------------+
|  route.ts (POST /api/webhooks/whatsapp)  |
|  1. Parsea payload                       |
|  2. Valida (isValidWebhookPayload)       |
|  3. Extrae texto (extractMessageData)    |
|  4. Routing: phone_number_id -> development, zone |
|  5. handleIncomingMessage(context)       |
|  6. Para cada outboundMessage:           |
|       - text   -> sendTextMessage        |
|       - image  -> sendImageMessage       |
|       - document -> sendDocumentMessage  |
|  7. saveWhatsAppLog(...)                 |
|  8. Responde 200 OK                      |
+------------------------------------------+
         |
         v
handleIncomingMessage (conversation-flows.ts)
         |
         v
getConversation(userPhone, development)  [PostgreSQL]
         |
         v
Según estado: handleInicio | handleFiltroIntencion | handleInfoReintento |
              handleCtaPrimario | handleSolicitudNombre | handleClientAccepta |
              handleSalidaElegante
         |
         v
FlowResult { outboundMessages[], nextState?, shouldCreateLead? }
         |
         v
route.ts envía cada mensaje por WhatsApp y guarda log
```

### Módulos principales

| Módulo | Ruta | Responsabilidad |
|--------|------|-----------------|
| Webhook route | `src/app/api/webhooks/whatsapp/route.ts` | Entrada HTTP (GET verificación, POST mensajes), orquestación, envío y log. |
| Webhook handler | `src/lib/modules/whatsapp/webhook-handler.ts` | Validación del payload, extracción de datos del mensaje (solo texto). |
| Channel router | `src/lib/modules/whatsapp/channel-router.ts` | Mapeo `phone_number_id` -> desarrollo y desarrollo -> zona. |
| Conversation state | `src/lib/modules/whatsapp/conversation-state.ts` | CRUD de conversaciones en PostgreSQL (estado, user_data, is_qualified). |
| Conversation flows | `src/lib/modules/whatsapp/conversation-flows.ts` | Orquestador principal: FSM handlers, logTransition, anti-loop. |
| Response selector | `src/lib/modules/whatsapp/response-selector.ts` | LLM elige clave de respuesta y siguiente estado; devuelve `reasoning`. |
| Intent classifier | `src/lib/modules/whatsapp/intent-classifier.ts` | Clasificación con LLM (intención y acción). |
| Context extractor | `src/lib/modules/whatsapp/context-extractor.ts` | Extrae resumen estructurado del lead usando Anthropic Claude. |
| Conversation keywords | `src/lib/modules/whatsapp/conversation-keywords.ts` | Detección de FAQ keywords y keywords de canal/salida. |
| Development content | `src/lib/modules/whatsapp/development-content.ts` | Banco de mensajes por desarrollo. |
| Media handler | `src/lib/modules/whatsapp/media-handler.ts` | URLs de imagen hero y brochure PDF por desarrollo. |
| WhatsApp client | `src/lib/modules/whatsapp/whatsapp-client.ts` | Llamadas HTTP a WhatsApp Cloud API (texto, imagen, documento). |
| Zoho lead activation | `src/lib/modules/whatsapp/zoho-lead-activation.ts` | Crea lead en Zoho CRM y canal en Cliq al calificar un lead. |
| Conversation access | `src/lib/modules/whatsapp/conversation-access.ts` | RBAC: verifica rol y acceso al desarrollo para endpoints del dashboard. |
| Types | `src/lib/modules/whatsapp/types.ts` | Tipos TypeScript (payload, mensajes, routing, etc.). |

---

## 3. Webhook (entrada)

### URL del webhook

- **GET** `.../api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`  
  Usado por Meta para verificar la suscripción. Si `hub.verify_token` coincide con `WHATSAPP_VERIFY_TOKEN`, se responde con `hub.challenge` en cuerpo (text/plain) y 200.

- **POST** `.../api/webhooks/whatsapp`  
  Meta envía aquí cada evento (mensajes entrantes, estados de lectura, etc.). El cuerpo es JSON (`WhatsAppWebhookPayload`).

### Estructura del payload (POST)

- `object`: debe ser `"whatsapp_business_account"`.
- `entry[]`: array de entradas; cada una tiene `id` y `changes[]`.
- Cada `change` tiene `field` y `value`; en `value` están `metadata` (incluye `phone_number_id`) y opcionalmente `messages[]`.

Solo se procesan cambios que contienen `messages`; de esos mensajes solo se consideran los de **tipo texto** (`type === 'text'` y `text.body` presente). Cualquier otro tipo (imagen, audio, video, documento, etc.) se ignora y se registra en debug.

### Validación y extracción

- **isValidWebhookPayload(payload)**: comprueba `object === 'whatsapp_business_account'` y que `entry` sea un array.
- **extractMessageData(payload)**: recorre `entry[].changes[].value.messages`, toma el primer mensaje de texto y devuelve `{ phoneNumberId, userPhone, message }` (el `message` es el texto plano). Si no hay mensaje de texto válido, devuelve `null`.

Si el payload no es válido o no hay mensaje de texto, el endpoint responde igualmente **200 OK** con `{ status: 'ok' }`, como exige Meta, para evitar reintentos innecesarios.

### Comportamiento tras extraer el mensaje

1. **Routing**: con `phoneNumberId` se obtiene `development` y `zone` (`getRouting(phoneNumberId)`). Si no hay configuración, se envía al usuario un mensaje de error ("este canal no está configurado") y se responde 200.
2. **Flujo**: se llama a `handleIncomingMessage({ development, zone, phoneNumberId, userPhone, messageText: message })`.
3. **Envío**: por cada elemento de `flowResult.outboundMessages` se llama a `sendTextMessage`, `sendImageMessage` o `sendDocumentMessage` según el `type`.
4. **Log**: se guarda un registro con `saveWhatsAppLog` (user_phone, development, mensaje entrante, texto de la primera respuesta y phone_number_id). Hoy solo se persiste el primer mensaje de la respuesta.
5. **Errores**: si `handleIncomingMessage` o el envío fallan, se envía un mensaje de fallback al usuario y se sigue respondiendo 200.

En ningún caso se devuelve un código distinto de 200 al POST del webhook (salvo el GET de verificación, que puede devolver 403 si el token no coincide).

---

## 4. Routing multi-desarrollo

El **número de teléfono de WhatsApp Business** (identificado por `phone_number_id` en el webhook) determina con qué desarrollo se está hablando.

### Configuración (channel-router.ts)

- **CHANNEL_CONFIG**: objeto que mapea `phone_number_id` (string) -> nombre del desarrollo (string).  
  Ejemplo: `'980541871814181': 'FUEGO'` (número de prueba; WABA ID: 2047862732669355). Se pueden añadir más pares para AMURA, PUNTO_TIERRA, etc.

- **DEVELOPMENT_TO_ZONE**: mapeo desarrollo -> zona (por ejemplo para futuras consultas al agente).  
  Ejemplo: `FUEGO -> quintana_roo`, `AMURA -> yucatan`, `PUNTO_TIERRA -> yucatan`.

### Funciones expuestas

- **getDevelopment(phoneNumberId)**: devuelve el desarrollo o `null` si no está configurado.
- **getRouting(phoneNumberId)**: devuelve `{ development, zone }` o `null` si falta desarrollo o zona.
- **isConfigured(phoneNumberId)**, **getConfiguredPhoneNumbers()**: utilidades para comprobar y listar números configurados.

Todo el contenido (mensajes, hero, brochure) y la lógica del flujo usan `development`; no usan directamente el `phone_number_id` más allá del routing inicial.

---

## 5. Estado de conversación y persistencia

Cada conversación se identifica por **(user_phone, development)** y se guarda en la tabla **whatsapp_conversations** (PostgreSQL).

### Tabla whatsapp_conversations

- **id**: serial.
- **user_phone**, **development**: identificador único de la conversación (índice único).
- **state**: estado actual de la FSM (véase sección 6).
- **user_data**: JSONB con datos acumulados (nombre, intención, retry_count, lead_quality, disqualified_reason, etc.).
- **last_interaction**: timestamp de la última interacción.
- **is_qualified**: booleano; true cuando el lead se ha calificado y se ha hecho handover.
- **zoho_lead_id**: ID del lead en Zoho (cuando exista integración real).
- **lead_quality**, **disqualified_reason**, **preferred_action**: campos de calidad y motivo de descalificación.
- **created_at**, **updated_at**.

La tabla se crea al importar el módulo (`initConversationsTable()`), con `CREATE TABLE IF NOT EXISTS` e índice único en `(user_phone, development)`.

### Operaciones (conversation-state.ts)

- **getConversation(userPhone, development)**: devuelve la fila actual o `null`.
- **upsertConversation(userPhone, development, updates)**: inserta o actualiza (ON CONFLICT) estado, user_data, is_qualified, zoho_lead_id, last_interaction.
- **updateState(userPhone, development, newState)**: actualiza `state` y `last_interaction`.
- **mergeUserData(userPhone, development, patch)**: fusiona `patch` en el JSONB `user_data` (y actualiza last_interaction).
- **markQualified(userPhone, development, zohoLeadId?)**: pone `is_qualified = true` y opcionalmente `zoho_lead_id`.
- **resetConversation(userPhone, development)**: borra la fila (útil para pruebas con el comando `/reset`).

---

## 6. Máquina de estados (FSM)

El flujo está implementado como una **máquina de estados** en `conversation-flows.ts`. El estado se guarda en `whatsapp_conversations.state`.

**Documento detallado de transiciones:** [fsm-transiciones-detalle.md](./fsm-transiciones-detalle.md) — allí se describe cada estado, qué respuesta del usuario se detecta y a qué estado se puede pasar (allowlist y flujos por handler).

**Diagrama de arquitectura del motor conversacional:** [conversational-engine-architecture.md](./conversational-engine-architecture.md) — flujo completo: LLM selector, fallback FSM, allowlist, persistencia (DB) y handover a Zoho/Cliq. Recomendado para devs nuevos en el proyecto.

### Estados activos (en uso)

| Estado | Descripción |
|-------|-------------|
| **INICIO** | Punto de partida; en la práctica se transiciona de inmediato a FILTRO_INTENCION mostrando bienvenida. |
| **FILTRO_INTENCION** | Se espera que el usuario indique si quiere comprar, invertir o solo información. |
| **INFO_REINTENTO** | Segunda oportunidad si el usuario fue clasificado como "solo info" o no claro; se pregunta de nuevo si busca invertir o vivir. |
| **CTA_PRIMARIO** | Se ofrece visita o que un agente contacte; se espera visitar, llamada, videollamada, contactado o rechazo. |
| **CTA_CANAL** | Si eligió "ser contactado" sin canal: se pregunta llamada telefónica o videollamada. |
| **SOLICITUD_HORARIO** | Se pide horario (visita) o día y horario (videollamada). |
| **SOLICITUD_NOMBRE** | Se pide el nombre completo antes del handover. |
| **CLIENT_ACCEPTA** | Lead calificado; handover a asesor; el bot ya no responde automáticamente. |
| **SALIDA_ELEGANTE** | Usuario descalificado (solo info persistente, rechazo explícito, etc.); mensaje de cierre. Si el usuario escribe de nuevo, se reinicia a INICIO. |

Estados legacy (ENVIO_BROCHURE, REVALIDACION_INTERES, etc.) siguen en el tipo pero no tienen handlers en el switch; el `default` redirige a `handleInicio`.

### Flujo detallado por estado

#### Antes de la FSM

- **Comando /reset**: si el mensaje es exactamente `/reset` (case-insensitive), se hace `resetConversation` y se envía un mensaje de confirmación de reinicio. No se usa la FSM.
- **Horario laboral**: `isBusinessHours()` está actualmente **desactivado** (siempre retorna `false`). Cuando esté activo, en horario laboral se enviará el mensaje FUERA_HORARIO y no se ejecutará la FSM (salvo si ya está calificado o en CLIENT_ACCEPTA, en cuyo caso no se envía nada).
- **Sin conversación**: si no existe fila para (user_phone, development), se hace upsert en estado INICIO. Si el primer mensaje es solo un saludo (`isOnlyGreeting`), se envía la bienvenida directamente. Si ya expresa intención (comprar/invertir/solo_info), se clasifica y se ejecuta **processState('FILTRO_INTENCION', ...)**. En caso contrario, se ejecuta **handleInicio** (bienvenida + opcionalmente imagen hero).
- **CLIENT_ACCEPTA o is_qualified**: se devuelve lista de mensajes vacía (el bot no responde).
- **SALIDA_ELEGANTE**: se actualiza estado a INICIO y se ejecuta handleInicio (reanudar conversación).

#### handleInicio(development, userPhone)

- Actualiza estado a **FILTRO_INTENCION**.
- Mensajes: texto de bienvenida (según desarrollo) y, si el desarrollo tiene `heroImageUrl`, un mensaje de tipo imagen con esa URL.

#### handleFiltroIntencion(messageText, development, userPhone, userData)

- Se clasifica la intención con **classifyIntent(messageText)** (LLM) y se revisan palabras clave (ej. "construir", "info", "precio").
- **Alta intención** (comprar / invertir / construir):  
  - Se guarda intención y se pasa a **CTA_PRIMARIO**.  
  - Respuesta: confirmación (compra o inversión según intención), opcionalmente documento PDF brochure si está configurado, y mensaje CTA_AYUDA (visita o llamada).
- **Solo info / precio**:  
  - Si ya hubo un reintento (`userData.retry_count >= 1`) -> **handleSalidaElegante** (info_loop).  
  - Si no, se guarda intención "solo_info" y retry_count, se pasa a **INFO_REINTENTO** y se envía mensaje INFO_REINTENTO.
- **No claro**:  
  - Si no hay retry_count, se trata como primera vez: se pone retry_count, estado **INFO_REINTENTO** y mensaje INFO_REINTENTO.  
  - Si ya había reintento -> **handleSalidaElegante** (unclear_intent).

#### handleInfoReintento(messageText, development, userPhone, userData)

- Si el usuario ahora muestra intención de comprar/invertir (LLM o palabras "si", "construir"): se marca "recuperado_de_info", estado **CTA_PRIMARIO**, mensaje de confirmación, opcional brochure y CTA_AYUDA.
- Si sigue en modo solo info/duda -> **handleSalidaElegante** (insiste_solo_info).

#### handleCtaPrimario(messageText, development, userPhone)

- Se clasifica la acción con **classifyCtaPrimario(messageText)** (LLM) y keywords.
- Orden de evaluación:
  1. **Negativo** (no gracias, luego, ahora no, etc.) -> **handleSalidaElegante** (rechazo_cta_explicito).
  2. **Visitar** (visita, ir a ver, conocer el desarrollo) -> estado **SOLICITUD_HORARIO**, `preferred_action: 'visita'`.
  3. **Canal explícito llamada** (por teléfono, que me llamen) -> short-circuit a **SOLICITUD_NOMBRE** (sin pedir horario), `preferred_channel: 'llamada'`.
  4. **Canal explícito videollamada** (video, zoom, meet) -> **SOLICITUD_HORARIO** (pide día+hora), `preferred_channel: 'videollamada'`.
  5. **Contactado genérico** (que me contacte un agente, sí sin canal) -> estado **CTA_CANAL**.
  6. **Ambiguo** -> **handleSalidaElegante** (rechazo_cta_ambiguo).

#### handleCtaCanal(messageText, development, userPhone)

- Solo se entra desde CTA_CANAL. El bot acaba de preguntar "¿Por llamada telefónica o por videollamada?".
- **Llamada** -> estado **SOLICITUD_NOMBRE** (short-circuit sin horario), `preferred_channel: 'llamada'`.
- **Videollamada** o afirmativo genérico -> estado **SOLICITUD_HORARIO**, `preferred_channel: 'videollamada'`.
- **Negativo** o **ambiguo** -> **handleSalidaElegante**.

#### handleSolicitudNombre(messageText, development, userPhone, userData)

- Se toma el texto como nombre. Si tiene menos de 3 caracteres, se pide de nuevo el nombre (mismo estado).
- Si es válido: se guarda en user_data y se llama **handleClientAccepta(..., name)**.

#### handleClientAccepta(development, userPhone, triggerText, userName?)

- Se llama al stub **createZohoLead** (por ahora solo log y ID stub).
- **markQualified**(userPhone, development, zohoLeadId).
- Se actualiza user_data (lead_quality ALTO, preferred_action, trigger_text, qualified_at).
- Estado -> **CLIENT_ACCEPTA**.
- Mensaje final: HANDOVER_EXITOSO con placeholder `{NOMBRE}` reemplazado por el primer nombre del usuario (capitalizado) si se proporcionó.

#### handleSalidaElegante(development, userPhone, reason)

- Se guarda en user_data lead_quality BAJO y disqualified_reason (reason).
- Estado -> **SALIDA_ELEGANTE**.
- Se envía mensaje SALIDA_ELEGANTE del desarrollo.

### Resumen de transiciones

- INICIO -> (automático) FILTRO_INTENCION (con bienvenida).
- FILTRO_INTENCION -> CTA_PRIMARIO (alta intención), INFO_REINTENTO (solo info o no claro), SALIDA_ELEGANTE (reintento agotado).
- INFO_REINTENTO -> CTA_PRIMARIO (recuperado), SALIDA_ELEGANTE (insiste solo info).
- CTA_PRIMARIO -> SOLICITUD_HORARIO (visitar/videollamada), SOLICITUD_NOMBRE (llamada, short-circuit), CTA_CANAL (contactado sin canal), SALIDA_ELEGANTE (negativo/ambiguo).
- CTA_CANAL -> SOLICITUD_NOMBRE (llamada), SOLICITUD_HORARIO (videollamada/sí), SALIDA_ELEGANTE (negativo/ambiguo).
- SOLICITUD_HORARIO -> SOLICITUD_NOMBRE (cualquier texto).
- SOLICITUD_NOMBRE -> CLIENT_ACCEPTA (nombre válido, 3+ chars) o se mantiene (nombre muy corto).
- CLIENT_ACCEPTA: sin transición (bot no responde).
- SALIDA_ELEGANTE: en el siguiente mensaje del usuario se fuerza INICIO y se muestra bienvenida de nuevo.

### Mecanismo anti-loop (stuck_in_state_count)

El campo `stuck_in_state_count` en `user_data` cuenta cuántos mensajes consecutivos no han avanzado el estado. Si llega a **3**, el sistema fuerza **SALIDA_ELEGANTE** con razón `'loop_detected'`, independientemente de lo que diga el LLM o el FSM. El contador se resetea a 0 cada vez que el estado sí avanza. Esto evita que usuarios queden atrapados indefinidamente en un estado.

---

## 7. Clasificación de intenciones (LLM)

El módulo **intent-classifier.ts** usa el servicio LLM del proyecto (`runLLM`) para clasificar el mensaje del usuario.

### classifyIntent(userMessage)

- **Salida**: `'comprar' | 'invertir' | 'solo_info' | null`.
- **Prompt**: sistema pide clasificar en una de esas tres categorías (comprar = lote para construir casa; invertir = patrimonio/negocio; solo_info = explorando). Usuario: "Respuesta del usuario: \"...\" Clasificación:".
- **Parámetros LLM**: temperature 0, max_tokens 10.
- **Parseo**: se busca en la respuesta "comprar", "invertir" o "solo"; si no coincide, se devuelve `null`.

### classifyAccion(userMessage)

- **Salida**: `'cita' | 'visita' | 'cotizacion' | null`.
- **Uso**: en CTA_PRIMARIO para reforzar la detección de aceptación (visita, llamada/cita, cotización).
- **Prompt**: sistema con opciones cita / visita / cotizacion; respuesta limitada.
- **Parseo**: se busca "cita"/"llamada", "visita", "cotiz" en la respuesta.

Otras funciones (classifyPerfilCompra, classifyPresupuesto, classifyUrgencia) están definidas pero no se usan en el flujo actual; son legacy para posibles extensiones.

---

## 8. LLM Response Selector

**Archivo:** `src/lib/modules/whatsapp/response-selector.ts`

A partir del estado `FILTRO_INTENCION`, la mayoría de transiciones las decide el **LLM response selector** en lugar de reglas deterministas. Esto permite respuestas más naturales ante variaciones de lenguaje.

### Funcionamiento

Para cada estado con LLM habilitado, el selector:
1. Construye un prompt con: estado actual, contexto del estado, últimos 6 mensajes de la conversación, datos del usuario acumulados.
2. Lista solo las **claves de respuesta** y **estados válidos** para ese estado (3–5 opciones, no la lista completa).
3. Pide al LLM que responda un JSON en una línea:
   ```json
   {"responseKey":"CTA_CANAL","nextState":"CTA_CANAL","reasoning":"El usuario quiere ser contactado sin especificar canal."}
   ```
4. Valida que `responseKey` y `nextState` estén en las allowlists del estado.
5. Si la validación falla, retorna `null` y el flujo cae al **FSM fallback** (lógica determinista).

### Estados con LLM selector

| Estado | Claves válidas | Next states válidos |
|---|---|---|
| `FILTRO_INTENCION` | CONFIRMACION_COMPRA, CONFIRMACION_INVERSION, INFO_REINTENTO, SALIDA_ELEGANTE | CTA_PRIMARIO, INFO_REINTENTO, SALIDA_ELEGANTE |
| `INFO_REINTENTO` | CONFIRMACION_COMPRA, CONFIRMACION_INVERSION, CTA_VISITA_O_CONTACTO, SALIDA_ELEGANTE | CTA_PRIMARIO, SALIDA_ELEGANTE |
| `CTA_PRIMARIO` | CTA_CANAL, SOLICITUD_HORARIO, SOLICITUD_NOMBRE, SALIDA_ELEGANTE | SOLICITUD_HORARIO, CTA_CANAL, SOLICITUD_NOMBRE, SALIDA_ELEGANTE |
| `CTA_CANAL` | SOLICITUD_HORARIO, SOLICITUD_NOMBRE, SALIDA_ELEGANTE | SOLICITUD_HORARIO, SOLICITUD_NOMBRE, SALIDA_ELEGANTE |
| `SOLICITUD_HORARIO` | SOLICITUD_NOMBRE | SOLICITUD_NOMBRE |
| `SOLICITUD_NOMBRE` | HANDOVER_EXITOSO, SOLICITUD_NOMBRE | CLIENT_ACCEPTA, SOLICITUD_NOMBRE |

### Campo `reasoning`

El LLM devuelve una frase corta explicando su decisión. Esta se persiste en `whatsapp_state_transitions.reasoning` (ver sección 11) y es visible en el timeline del dashboard. Útil para depurar por qué el bot tomó cierta decisión.

### Anti-loop (allowlist de siguiente estado)

La constante `ALLOWED_NEXT_STATES_BY_STATE` define qué estados puede alcanzar el LLM desde cada estado. Si el LLM propone un estado fuera de la allowlist, el sistema lo rechaza y aplica FSM fallback. Esto evita que el LLM salte a estados incorrectos.

---

## 9. FAQ Router y keywords

**Archivo:** `src/lib/modules/whatsapp/conversation-keywords.ts`

Antes de invocar al LLM response selector, el flujo revisa si el mensaje del usuario contiene **keywords** que permiten responder determinísticamente sin gastar un call al LLM.

### Tipos de keywords

- **Keywords de FAQ:** preguntas frecuentes sobre ubicación, precio, amenidades, financiamiento, entrega, etc. El bot responde con el texto del FAQ del desarrollo y **no cambia de estado** (la conversación continúa donde estaba).
- **Keywords de canal:** "llamada", "teléfono", "videollamada", "zoom", "visitar", "ir a ver" — detectadas en CTA_PRIMARIO y CTA_CANAL para hacer short-circuit sin LLM.
- **Keywords de salida:** "no gracias", "no me interesa", "adiós" — fuerzan SALIDA_ELEGANTE directamente.

### Prioridad de evaluación

```
1. Comando /reset
2. Anti-loop (stuck_in_state_count >= 3)
3. FAQ keywords (si aplica para el estado actual)
4. LLM response selector
5. FSM fallback (si LLM falla o devuelve resultado inválido)
```

Las transiciones por keyword se registran con `triggered_by='keyword'` en el historial de estados.

---

## 10. Context Extractor (Anthropic)

**Archivo:** `src/lib/modules/whatsapp/context-extractor.ts`

Cuando un lead es cualificado, antes de crear el canal en Zoho Cliq, el sistema extrae un **resumen estructurado** de la conversación usando Anthropic Claude.

### Qué extrae

- Nombre del usuario
- Intención (comprar / invertir)
- Canal preferido (llamada / videollamada / visita)
- Horario preferido
- Notas relevantes del historial de chat

### Para qué se usa

El resumen se postea como **primer mensaje** en el canal de Cliq que ve el asesor, dándole contexto completo del lead sin tener que leer toda la conversación.

```env
ANTHROPIC_API_KEY=sk-ant-...
# Modelo por defecto: claude-haiku-4-5-20251001
```

---

## 11. Historial de transiciones de estado

**Migración:** `migrations/046_whatsapp_state_transitions.sql`
**Endpoint:** `GET /api/whatsapp/conversations/state-history`
**UI:** panel de detalle en `/dashboard/conversaciones`

Cada vez que la FSM cambia de estado, se registra una fila en `whatsapp_state_transitions` con:

| Campo | Descripción |
|---|---|
| `from_state` | Estado anterior (NULL = primera transición) |
| `to_state` | Nuevo estado |
| `trigger_message` | Texto del mensaje del usuario que causó el cambio |
| `response_key` | Clave del banco de mensajes enviada |
| `triggered_by` | `llm` / `keyword` / `fsm` / `anti_loop` / `reset` / `system` |
| `reasoning` | Justificación del LLM (solo cuando `triggered_by='llm'`) |

### Escritura fire-and-forget

La función `logTransition()` en `conversation-flows.ts` llama a `saveStateTransition()` sin `await`. Esto significa que el registro en BD **no bloquea el flujo** del bot. Si la tabla no existe (migración pendiente), falla silenciosamente.

### API

```
GET /api/whatsapp/conversations/state-history
  ?user_phone=521234567890
  &development=FUEGO
  &limit=50        # opcional, máx 200
```

Auth: Bearer token JWT con rol `admin`, `manager` o `asesor` con acceso al desarrollo.

Respuesta:
```json
{
  "transitions": [
    {
      "id": 1,
      "from_state": null,
      "to_state": "FILTRO_INTENCION",
      "trigger_message": "Hola",
      "response_key": "BIENVENIDA",
      "triggered_by": "system",
      "reasoning": null,
      "created_at": "2026-03-06T10:00:00Z"
    },
    {
      "id": 2,
      "from_state": "FILTRO_INTENCION",
      "to_state": "CTA_PRIMARIO",
      "trigger_message": "Quiero comprar un lote",
      "response_key": "CONFIRMACION_COMPRA",
      "triggered_by": "llm",
      "reasoning": "El usuario expresa intención de compra explícita.",
      "created_at": "2026-03-06T10:01:30Z"
    }
  ]
}
```

### Timeline en el dashboard

En `/dashboard/conversaciones`, al expandir el detalle de una conversación, aparece el botón "Ver timeline". Al hacer clic carga el historial bajo demanda (lazy fetch) y muestra una línea de tiempo vertical con badges de color por `triggered_by`:

| Color | `triggered_by` |
|---|---|
| Violeta | llm |
| Azul cielo | keyword |
| Gris | fsm |
| Rojo | anti_loop |
| Ámbar | reset |
| Esmeralda | system |

---

## 12. Contenido y medios por desarrollo

El desarrollo viene del routing; con él se eligen textos y medios.

### development-content.ts

- **getMessagesForDevelopment(development)**: devuelve un objeto **DevelopmentMessages** con las claves: BIENVENIDA, CONFIRMACION_COMPRA, CONFIRMACION_INVERSION, CTA_AYUDA, SOLICITUD_NOMBRE, INFO_REINTENTO, HANDOVER_EXITOSO, CONFIRMACION_FINAL, SALIDA_ELEGANTE, FUERA_HORARIO.
- El parámetro se normaliza a mayúsculas y espacios -> guión bajo para la clave (ej. "PUNTO_TIERRA").
- Hay conjuntos definidos para FUEGO, AMURA y PUNTO_TIERRA; si el desarrollo no existe, se usa FUEGO como fallback.

Cada desarrollo puede tener copy distinto (nombre del desarrollo, tono, CTA); el flujo siempre usa `getMessagesForDevelopment(development)` para obtener los textos.

### media-handler.ts

- **DEVELOPMENT_MEDIA**: por desarrollo se configuran opcionalmente `heroImageUrl`, `brochureUrl`, `amenitiesImageUrl`, `locationImageUrl`. Solo hero y brochure se usan en el flujo.
- **DEVELOPMENT_BROCHURE_FILENAME**: nombre del archivo PDF por desarrollo (ej. "Brochure-FUEGO.pdf") para el envío por WhatsApp.
- **getHeroImage(development)**: URL de la imagen hero o null.
- **getBrochure(development)**: URL del PDF o undefined.
- **getBrochureFilename(development)**: nombre del archivo para el documento.

**Dónde se usan:**

- **Hero**: en handleInicio, después del texto de bienvenida; se añade un OutboundMessage de tipo `image` si hay hero.
- **Brochure**: en handleFiltroIntencion (cuando el usuario tiene alta intención) y en handleInfoReintento (cuando se recupera); se añade un OutboundMessage de tipo `document` si hay brochureUrl.

---

## 13. Envío de mensajes (salida)

### Tipos de mensaje saliente (OutboundMessage)

- **text**: `{ type: 'text', text: string }`.
- **image**: `{ type: 'image', imageUrl: string, caption?: string }`.
- **document**: `{ type: 'document', documentUrl: string, filename: string, caption?: string }`.

El flujo devuelve un **FlowResult** con `outboundMessages: OutboundMessage[]`. El webhook los envía **en orden**; el cliente de WhatsApp no garantiza orden de llegada al usuario si se envían muchos seguidos, pero el código los envía secuencialmente.

### WhatsApp client (whatsapp-client.ts)

- **Base**: `https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phoneNumberId}/messages`, método POST, header `Authorization: Bearer WHATSAPP_ACCESS_TOKEN`.
- **sendTextMessage(phoneNumberId, to, message)**: body tipo `text`, con `preview_url: false`. Si el mensaje supera 4096 caracteres se trunca y se registra warning.
- **sendImageMessage(phoneNumberId, to, imageUrl, caption?)**: body tipo `image` con `link` y opcional caption.
- **sendDocumentMessage(phoneNumberId, to, documentUrl, filename, caption?)**: body tipo `document` con `link`, `filename` y opcional caption.

Todas las llamadas usan **withTimeout** (TIMEOUTS.EXTERNAL_API). En error de API o excepción se registra el error y se devuelve `null`; el route interpreta eso como fallo de envío pero sigue con el resto de mensajes y responde 200.

### Log de conversaciones

**saveWhatsAppLog** guarda un registro por request con: user_phone, development, mensaje entrante, texto de la primera respuesta (o "[imagen enviada]" / "[documento enviado]" si el primer mensaje no es texto) y phone_number_id. Actualmente no se guarda un registro por cada mensaje saliente.

---

## 14. Variables de entorno y configuración

Relevantes para el bot:

- **WHATSAPP_VERIFY_TOKEN**: token que Meta envía en la verificación del webhook; debe coincidir con el configurado en Meta.
- **WHATSAPP_ACCESS_TOKEN**: token de acceso para WhatsApp Cloud API (envío de mensajes).
- **WHATSAPP_API_VERSION**: versión de la API (por defecto "v22.0").

La base de datos PostgreSQL se configura en el resto del proyecto (conexión usada por `conversation-state` y `saveWhatsAppLog`). El LLM usado por el intent classifier depende de la configuración de `runLLM` en el proyecto.

---

## 15. Bridge WhatsApp-Cliq (Zoho Cliq)

Cuando un lead se califica (usuario acepta handover y da su nombre), el backend crea un lead real en Zoho CRM, un canal en Zoho Cliq por lead y un bridge: los mensajes entrantes de WhatsApp se reenvían al canal Cliq y las respuestas del asesor en Cliq se reenvían a WhatsApp.

### Variables de entorno (Cliq y bridge)

- **ZOHO_CLIQ_CLIENT_ID**, **ZOHO_CLIQ_CLIENT_SECRET**, **ZOHO_CLIQ_REFRESH_TOKEN**: OAuth2 para Zoho Cliq API v2 (crear canales, invitar por email). Si usas la misma cuenta que CRM, **ZOHO_CLIQ_ACCOUNTS_URL** puede omitirse (se usa **ZOHO_ACCOUNTS_URL**).
- **ZOHO_CLIQ_API_URL**: base de la API Cliq (por defecto `https://cliq.zoho.com/api/v2`).
- **CLIQ_BRIDGE_SECRET**: secreto compartido para validar peticiones entre backend y Deluge (header `X-Bridge-Token` o query/body `secret`).
- **CLIQ_BOT_INCOMING_WEBHOOK_URL**: URL del Incoming Webhook del bot en Cliq (Deluge recibe aquí el payload del backend y publica en el canal).
- **CLIQ_AGENT_BY_DEVELOPMENT**: (opcional) JSON con mapeo desarrollo -> email del asesor, ej. `{"FUEGO":"asesor@empresa.com"}`. Se usa si Zoho no devuelve Owner/email en el GET Lead.
- **CLIQ_ALWAYS_INVITE_EMAILS**: (opcional) Emails que se invitan a **todos** los canales de Cliq (monitoreo). Separados por coma. Ej. `supervisor@empresa.com` o `user1@empresa.com,user2@empresa.com`. La API de Cliq usa emails, no IDs numéricos; si tienes un usuario por ID (ej. 895282745), usa el email de ese usuario en Zoho.
- **ZOHO_CRM_BASE_URL**: (opcional) URL base del CRM para enlazar el lead en mensajes a Cliq, ej. `https://crm.zoho.com/crm/org123456`.

### Contrato Backend -> Cliq (Incoming Webhook Deluge)

El backend envía POST a **CLIQ_BOT_INCOMING_WEBHOOK_URL** con:

- **Headers:** `Content-Type: application/json`, `X-Bridge-Token: <CLIQ_BRIDGE_SECRET>`.
- **Body JSON:**
  - `channel_id`, `channel_unique_name`: identificadores del canal (Deluge usa `channel_unique_name` para `zoho.cliq.postToChannel`).
  - `conversation_id`, `wa_message_id`, `development`, `user_phone`, `user_name`, `text`, `crm_lead_url`.

Ejemplo de cuerpo:

```json
{
  "channel_id": "T4000000040005",
  "channel_unique_name": "wa_fuego_123",
  "conversation_id": "wa:+521234567890|FUEGO",
  "wa_message_id": "wamid.xxx",
  "development": "FUEGO",
  "user_phone": "+521234567890",
  "user_name": "Juan Perez",
  "text": "Hola, quiero invertir",
  "crm_lead_url": "https://crm.zoho.com/crm/orgXXX/tab/Leads/123..."
}
```

El handler Deluge debe validar `X-Bridge-Token` (o `body.secret` si no puede leer headers), formatear el texto con prefijo `[WA-IN]` y publicar en el canal con `zoho.cliq.postToChannel(channel_unique_name, formatted_text)`.

Ejemplo de lógica Deluge (Incoming Webhook Handler):

```
// 1. Validar token (si Deluge no expone headers, usar body.secret)
token = body.get("secret")  // o leer header X-Bridge-Token si está disponible
if token != CLIQ_BRIDGE_SECRET then
  return { "ok": false, "reason": "invalid_token" }

// 2. Extraer campos
channel_id = body.get("channel_id")
channel_unique_name = body.get("channel_unique_name")
user_name = body.get("user_name", "Cliente")
user_phone = body.get("user_phone", "")
text = body.get("text", "")
development = body.get("development", "")
crm_lead_url = body.get("crm_lead_url", "")

// 3. Formatear mensaje para el canal
formatted = "[WA-IN] " + user_name + " (" + user_phone + ")\n" + text + "\nDEV:" + development + "\nCRM:" + crm_lead_url

// 4. Publicar en el canal (por unique_name)
zoho.cliq.postToChannel(channel_unique_name, formatted)

return { "ok": true, "channel_id": channel_id, "wa_message_id": body.get("wa_message_id", "") }
```

### Cliq -> WhatsApp (Outgoing Webhook)

- **POST** `.../api/webhooks/cliq`: recibe el payload del Channel Outgoing Webhook de Cliq.
- Validación: header `X-Bridge-Token` o query `secret` o body `secret` igual a **CLIQ_BRIDGE_SECRET**.
- Body esperado: `channel_id`, `message` (o `text`), `sender` (opcional). Se ignora si el mensaje contiene `[WA-IN]` (anti-loop).
- El backend busca el thread por `cliq_channel_id`, obtiene `phone_number_id` y `user_phone`, y envía el mensaje por WhatsApp.

### Configuración Zoho Cliq (paso a paso)

1. **Crear Bot**: Admin -> Bots -> Add Bot; activar **Incoming Webhook Handler** y copiar la URL del webhook -> **CLIQ_BOT_INCOMING_WEBHOOK_URL**.
2. **OAuth Cliq API v2**: en Zoho API Console registrar cliente con scopes `ZohoCliq.Channels.CREATE`, `ZohoCliq.Channels.READ`; obtener refresh token y configurar **ZOHO_CLIQ_CLIENT_ID**, **ZOHO_CLIQ_CLIENT_SECRET**, **ZOHO_CLIQ_REFRESH_TOKEN**.
3. **Channel Outgoing Webhook**: en el canal (o global) configurar un Outgoing Webhook que apunte a `https://<tu-dominio>/api/webhooks/cliq`. Si Cliq no permite headers personalizados, usar query `?secret=<CLIQ_BRIDGE_SECRET>` y validar en el backend.

### Tabla whatsapp_cliq_threads (migración 039)

Almacena el mapeo (user_phone, development) -> canal Cliq y `phone_number_id` para ruteo Cliq -> WA: `id`, `user_phone`, `development`, `phone_number_id`, `zoho_lead_id`, `assigned_agent_email`, `cliq_channel_id`, `cliq_channel_unique_name`, `status`, `created_at`, `updated_at`. Índice único (user_phone, development) e índice por cliq_channel_id.

---

## 16. Limitaciones actuales y extensiones futuras

### Limitaciones

- **Solo mensajes de texto entrantes**: imagen, audio, video, documento del usuario se ignoran (no se transcriben ni se procesan).
- **Un solo mensaje por webhook**: si el payload trae varios mensajes de texto, solo se procesa el primero.
- **Deduplicación de webhooks**: implementada en base de datos mediante la tabla `whatsapp_message_dedup` (migración 045). La función `claimWhatsAppMessage(messageId)` hace `INSERT ... ON CONFLICT DO NOTHING`; si el INSERT no inserta ninguna fila, el mensaje ya fue procesado y se descarta. Esto es atómico y funciona en múltiples instancias serverless. Si la tabla no existe, el sistema es fail-open (procesa igual).
- **Log de respuesta**: solo se persiste el primer mensaje de la respuesta en saveWhatsAppLog.
- **Zoho**: createZohoLead está implementado (createZohoLeadRecord + GET Lead); el bridge con Cliq requiere configurar Cliq (bot, OAuth, webhooks) y las variables de entorno correspondientes.
- **Horario laboral**: isBusinessHours() está desactivado (siempre false).
- **Estados legacy**: existen en el tipo y en la tabla pero no tienen handlers (redirigen a inicio).

### Posibles extensiones

- Soportar mensajes entrantes de tipo imagen/audio (transcripción o análisis) y reutilizar el mismo flujo.
- Bridge opcional con Zoho Cliq (canal por lead, mensajes WA <-> Cliq) ya implementado; ver sección 11.
- Activar y afinar horario laboral (mensaje fuera de horario, posible handover diferido).
- Guardar en log todos los mensajes enviados en una misma respuesta.
- Limpiar estados legacy del tipo y de la FSM si no se van a usar.
- Añadir más desarrollos: nuevo phone_number_id en channel-router, mensajes en development-content y medios en media-handler.

---

## 17. Despliegue en Vercel (serverless)

**¿Es correcto tener el bot en Vercel en serverless?** Sí, es una opción válida y el bot está preparado para ello (webhook sin rate limit, token y `phone_number_id` validados, timeouts y manejo de errores). Para que **conteste de forma consistente** conviene tener en cuenta lo siguiente.

### Ventajas de serverless para el bot

- Escala automáticamente con el tráfico.
- No hay servidor que mantener.
- Pago por uso; el webhook solo corre cuando Meta envía eventos.

### Puntos a vigilar

| Aspecto | Riesgo | Recomendación |
|--------|--------|----------------|
| **Cold start** | La primera petición tras un rato en frío puede tardar 1–5 s. Meta espera respuesta en unos segundos. | En la práctica suele ser aceptable. Si el tráfico es muy bajo, un cron que llame al webhook cada 5–10 min mantiene la función “caliente”. |
| **Timeout** | Vercel Hobby: 10 s; Pro: 60 s. Si el flujo (DB + lógica + envío) supera el límite, la función se corta y no se devuelve 200. | Mantener el handler ligero: el flujo actual (consulta/upsert en Postgres, FSM, 1–3 mensajes) suele caber en 10 s. Evitar trabajo pesado antes de responder. |
| **Variables de entorno** | Si `WHATSAPP_ACCESS_TOKEN` (o la DB) no está definida en el entorno de ejecución, el bot no puede enviar respuestas. | Configurar en Vercel todas las variables necesarias para Production/Preview y hacer redeploy tras cambiarlas. |
| **Reintentos de Meta** | Si no respondemos 200 a tiempo, Meta reenvía el mismo webhook. Sin deduplicación podríamos procesar el mismo mensaje dos veces. | La deduplicación actual es en memoria (no compartida entre invocaciones). Para tráfico alto, convendría deduplicar por `message_id` en DB o Redis. |

### Conclusión

Sí es correcto tener el bot en Vercel en serverless. Para que **conteste correctamente de forma estable**:

1. Configura bien las variables en Vercel (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, Postgres).
2. Mantén el handler rápido (sin tareas pesadas antes de devolver 200).
3. Acepta que la primera petición tras inactividad puede ser más lenta (cold start).
4. Si esperas mucho volumen o necesitas garantía frente a reintentos de Meta, añade deduplicación por `message_id` en base de datos.

---

## 18. Solución de problemas

### URL del webhook: qué poner en Meta y cómo comprobarla

Si **no ves ningún log** cuando alguien escribe al bot, lo más probable es que la URL configurada en Meta no sea la correcta o no esté llegando a tu proyecto en Vercel.

**URL que debes usar (exacta):**

```
https://<TU_DOMINIO>/api/webhooks/whatsapp
```

- Sustituye `<TU_DOMINIO>` por tu dominio en Vercel, por ejemplo:
  - `tu-proyecto.vercel.app` (dominio por defecto de Vercel), o
  - `www.tudominio.com` si tienes dominio propio enlazado.
- **Sin** barra final: `/api/webhooks/whatsapp` (no `/api/webhooks/whatsapp/`).
- **Siempre** `https://`, nunca `http://`.

**Ejemplo:** si tu app en Vercel se llama `agente-capital` y usas el dominio por defecto:

```
https://agente-capital.vercel.app/api/webhooks/whatsapp
```

**Dónde configurarla en Meta:**

1. Entra a [developers.facebook.com](https://developers.facebook.com) y abre tu app.
2. Menú **WhatsApp** > **Configuración** (o **Configuration**).
3. En **Webhook**, clic en **Configurar** o **Edit**.
4. En **Callback URL** pega exactamente: `https://<TU_DOMINIO>/api/webhooks/whatsapp`.
5. En **Token de verificación** escribe el mismo valor que tienes en la variable de entorno **WHATSAPP_VERIFY_TOKEN** en Vercel (ej. `Bot_rag`).
6. Guarda y haz clic en **Verificar y guardar**. Meta enviará un GET a esa URL; si el token coincide, la verificación pasa.

**Comprobar que la URL responde (antes de depender de los logs):**

- Abre en el navegador: `https://<TU_DOMINIO>/api/webhooks/whatsapp`  
  Deberías ver **403 Forbidden** o un mensaje de error (porque no llevas `hub.mode`, `hub.verify_token`, etc.). Eso confirma que la ruta existe y que el despliegue está activo.
- Con curl (GET):  
  `curl -i "https://<TU_DOMINIO>/api/webhooks/whatsapp"`  
  Deberías recibir 403. Si recibes 404 o no hay respuesta, la URL o el despliegue están mal.

**Errores frecuentes:**

| Error | Solución |
|-------|----------|
| Puse `http://` | Meta exige HTTPS. Usa `https://`. |
| Puse barra al final `/api/webhooks/whatsapp/` | Prueba sin barra: `/api/webhooks/whatsapp`. |
| Usé la URL de Preview en vez de Production | En Meta usa la misma URL que abre tu app en producción (la que ves en Vercel en el deployment de Production). |
| Dominio equivocado | En Vercel > proyecto > Settings > Domains revisa cuál es tu dominio de producción y usa ese. |

---

### Webhook: "Webhook verification failed" con mode/token/challenge en null

Si en los logs ves `received: null, mode: null, challenge: null`:

- La petición GET que llegó **no** trae los query params de Meta (no fue la verificación de Meta).
- Puede ser una visita en navegador, un health check o un monitor. La verificación real de Meta envía `hub.mode=subscribe`, `hub.verify_token=...` y `hub.challenge=...`.

**Qué hacer:**

1. En Meta (Configuración del webhook) pon el **Token de verificación** exactamente igual que la variable de entorno **WHATSAPP_VERIFY_TOKEN** en Vercel (por ejemplo `Bot_rag`).
2. Guarda la URL del webhook en Meta y vuelve a hacer "Verificar y guardar". Solo entonces Meta enviará el GET con los parámetros y la verificación debería pasar.

### Postgres: "Connection terminated due to connection timeout" / circuit breaker en Vercel

Si ves timeouts de conexión o circuit breaker abierto:

1. **Usar pooler (Transaction mode):** En Vercel configura **POSTGRES_URL** con la cadena de **Connection pooling** (Transaction mode) de Supabase, no la conexión directa.
2. **Variables opcionales:** Puedes subir el timeout con `POSTGRES_CONNECTION_TIMEOUT=30000` (30 segundos). En serverless el código ya usa más reintentos automáticos.
3. **Reset del circuit breaker:** Si el circuito queda abierto, puedes llamar a `POST /api/health/reset-circuit-breaker` (requiere rol admin/ceo) para forzar un nuevo intento.

---

*Documento generado a partir del código del proyecto. Última revisión según la implementación actual del bot de WhatsApp.*
