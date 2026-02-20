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
8. [Contenido y medios por desarrollo](#8-contenido-y-medios-por-desarrollo)
9. [Envío de mensajes (salida)](#9-envío-de-mensajes-salida)
10. [Variables de entorno y configuración](#10-variables-de-entorno-y-configuración)
11. [Limitaciones actuales y extensiones futuras](#11-limitaciones-actuales-y-extensiones-futuras)

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
| Conversation flows | `src/lib/modules/whatsapp/conversation-flows.ts` | FSM del flujo: estados, transiciones y mensajes de respuesta. |
| Intent classifier | `src/lib/modules/whatsapp/intent-classifier.ts` | Clasificación con LLM (intención y acción). |
| Development content | `src/lib/modules/whatsapp/development-content.ts` | Textos (mensajes) por desarrollo. |
| Media handler | `src/lib/modules/whatsapp/media-handler.ts` | URLs de imagen hero y brochure PDF por desarrollo. |
| WhatsApp client | `src/lib/modules/whatsapp/whatsapp-client.ts` | Llamadas HTTP a WhatsApp Cloud API (texto, imagen, documento). |
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

### Estados activos (en uso)

| Estado | Descripción |
|-------|-------------|
| **INICIO** | Punto de partida; en la práctica se transiciona de inmediato a FILTRO_INTENCION mostrando bienvenida. |
| **FILTRO_INTENCION** | Se espera que el usuario indique si quiere comprar, invertir o solo información. |
| **INFO_REINTENTO** | Segunda oportunidad si el usuario fue clasificado como "solo info" o no claro; se pregunta de nuevo si busca invertir o vivir. |
| **CTA_PRIMARIO** | Se ofrece visita o llamada; se espera aceptación o rechazo. |
| **SOLICITUD_NOMBRE** | Se pide el nombre completo antes del handover. |
| **CLIENT_ACCEPTA** | Lead calificado; handover a asesor; el bot ya no responde automáticamente. |
| **SALIDA_ELEGANTE** | Usuario descalificado (solo info persistente, rechazo explícito, etc.); mensaje de cierre. Si el usuario escribe de nuevo, se reinicia a INICIO. |

Estados legacy (ENVIO_BROCHURE, REVALIDACION_INTERES, etc.) siguen en el tipo pero no tienen handlers en el switch; el `default` redirige a `handleInicio`.

### Flujo detallado por estado

#### Antes de la FSM

- **Comando /reset**: si el mensaje es exactamente `/reset` (case-insensitive), se hace `resetConversation` y se envía un mensaje de confirmación de reinicio. No se usa la FSM.
- **Horario laboral**: `isBusinessHours()` está actualmente **desactivado** (siempre retorna `false`). Cuando esté activo, en horario laboral se enviará el mensaje FUERA_HORARIO y no se ejecutará la FSM (salvo si ya está calificado o en CLIENT_ACCEPTA, en cuyo caso no se envía nada).
- **Sin conversación**: si no existe fila para (user_phone, development), se hace upsert en estado INICIO y se ejecuta **handleInicio** (bienvenida + opcionalmente imagen hero).
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

- Se clasifica la acción con **classifyAccion(messageText)** (LLM).
- **Negativo explícito** (no puedo, no gracias, no quiero, ahora no, luego, ocupado, "no" muy corto, etc.) -> **handleSalidaElegante** (rechazo_cta_explicito).
- **Afirmativo** (si, claro, agendar, visita, llama, ok, va, bueno, o acción clara del LLM) -> estado **SOLICITUD_NOMBRE** y mensaje SOLICITUD_NOMBRE.
- **Ambiguo** -> **handleSalidaElegante** (rechazo_cta_ambiguo).

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
- CTA_PRIMARIO -> SOLICITUD_NOMBRE (acepta), SALIDA_ELEGANTE (rechaza o ambiguo).
- SOLICITUD_NOMBRE -> CLIENT_ACCEPTA (nombre válido) o se mantiene (nombre corto).
- CLIENT_ACCEPTA: sin transición (bot no responde).
- SALIDA_ELEGANTE: en el siguiente mensaje del usuario se fuerza INICIO y se muestra bienvenida de nuevo.

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

## 8. Contenido y medios por desarrollo

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

## 9. Envío de mensajes (salida)

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

## 10. Variables de entorno y configuración

Relevantes para el bot:

- **WHATSAPP_VERIFY_TOKEN**: token que Meta envía en la verificación del webhook; debe coincidir con el configurado en Meta.
- **WHATSAPP_ACCESS_TOKEN**: token de acceso para WhatsApp Cloud API (envío de mensajes).
- **WHATSAPP_API_VERSION**: versión de la API (por defecto "v22.0").

La base de datos PostgreSQL se configura en el resto del proyecto (conexión usada por `conversation-state` y `saveWhatsAppLog`). El LLM usado por el intent classifier depende de la configuración de `runLLM` en el proyecto.

---

## 11. Limitaciones actuales y extensiones futuras

### Limitaciones

- **Solo mensajes de texto entrantes**: imagen, audio, video, documento del usuario se ignoran (no se transcriben ni se procesan).
- **Un solo mensaje por webhook**: si el payload trae varios mensajes de texto, solo se procesa el primero.
- **Deduplicación en memoria**: `webhook-handler` tiene un Set de IDs de mensajes procesados con límite de tamaño; no hay deduplicación persistente (p. ej. Redis), por lo que en reinicios o múltiples instancias podría procesarse dos veces el mismo mensaje.
- **Log de respuesta**: solo se persiste el primer mensaje de la respuesta en saveWhatsAppLog.
- **Zoho**: createZohoLead es un stub; no hay integración real con Zoho CRM.
- **Horario laboral**: isBusinessHours() está desactivado (siempre false).
- **Estados legacy**: existen en el tipo y en la tabla pero no tienen handlers (redirigen a inicio).

### Posibles extensiones

- Soportar mensajes entrantes de tipo imagen/audio (transcripción o análisis) y reutilizar el mismo flujo.
- Integración real con Zoho (o otro CRM) en handleClientAccepta.
- Activar y afinar horario laboral (mensaje fuera de horario, posible handover diferido).
- Deduplicación por message_id en base de datos o Redis.
- Guardar en log todos los mensajes enviados en una misma respuesta.
- Limpiar estados legacy del tipo y de la FSM si no se van a usar.
- Añadir más desarrollos: nuevo phone_number_id en channel-router, mensajes en development-content y medios en media-handler.

---

## 12. Solución de problemas

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
