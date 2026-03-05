# FSM: detalle de estados y transiciones

Documento de referencia: cada estado de la máquina de estados, qué mensaje envía el bot, qué tipo de respuesta del usuario se detecta y a qué estado se transiciona. Basado en `conversation-flows.ts` y la allowlist `ALLOWED_NEXT_STATES_BY_STATE`.

---

## Allowlist (estados permitidos desde cada estado)

El LLM y la FSM solo pueden pasar a estados que estén en esta lista. Cualquier otro `nextState` se rechaza y se usa el fallback por keywords.

| Estado actual       | Estados a los que SÍ se puede pasar                          |
|---------------------|--------------------------------------------------------------|
| **INICIO**          | FILTRO_INTENCION                                             |
| **FILTRO_INTENCION** | CTA_PRIMARIO, INFO_REINTENTO, SALIDA_ELEGANTE             |
| **INFO_REINTENTO**  | CTA_PRIMARIO, SALIDA_ELEGANTE                                |
| **CTA_PRIMARIO**    | SOLICITUD_HORARIO, SOLICITUD_NOMBRE, CTA_CANAL, SALIDA_ELEGANTE |
| **CTA_CANAL**       | SOLICITUD_HORARIO, SOLICITUD_NOMBRE, SALIDA_ELEGANTE         |
| **SOLICITUD_HORARIO** | SOLICITUD_NOMBRE                                           |
| **SOLICITUD_NOMBRE**  | CLIENT_ACCEPTA, SOLICITUD_NOMBRE (re-pedir nombre)         |
| **CLIENT_ACCEPTA**  | (ninguno; el bot ya no responde)                             |
| **SALIDA_ELEGANTE** | (ninguno; en el *siguiente* mensaje del usuario se fuerza INICIO) |

---

## Flujo 1: INICIO

**Cuándo se entra:** Primera vez que el usuario escribe (no existía conversación) y el primer mensaje **no** fue clasificado como intención explícita (comprar/invertir/solo_info). O el `switch` recibe estado `INICIO` (default desde estados legacy).

**Handler:** `handleInicio(development, userPhone)` — no recibe el mensaje del usuario; solo envía bienvenida.

**Qué envía el bot:**
- Texto: `BIENVENIDA` (por desarrollo).
- Si el desarrollo tiene hero image: imagen después del texto.

**Transición (fija, sin depender del mensaje):**

| Respuesta del usuario | Siguiente estado |
|-----------------------|------------------|
| (no se evalúa; se ejecuta al entrar) | **FILTRO_INTENCION** |

**Datos que se guardan:** Ninguno nuevo (solo `state = FILTRO_INTENCION`).

---

## Flujo 2: FILTRO_INTENCION

**Cuándo se entra:** Tras INICIO (bienvenida) o cuando el usuario ya está en FILTRO_INTENCION y escribe otro mensaje.

**Handler:** `handleFiltroIntencion(messageText, development, userPhone, userData)`.

**Qué envía el bot (según rama):** Ver tabla de transiciones.

**Transiciones (según respuesta del usuario):**

| Tipo de respuesta detectada | Condición adicional | Siguiente estado | Mensaje(s) que envía el bot |
|-----------------------------|--------------------|------------------|-----------------------------|
| Solo saludo | `isOnlyGreeting(text)` (hola, buenas, hey, etc.) | **FILTRO_INTENCION** (se queda) | BIENVENIDA + hero image si hay |
| Alta intención | comprar / invertir / mixto / "construir" (keywords o LLM) | **CTA_PRIMARIO** | CONFIRMACION_COMPRA o CONFIRMACION_INVERSION + CTA_VISITA_O_CONTACTO |
| Solo info | solo_info (keywords/LLM) o texto con "info", "precio", "informacion", "cotiz", "cuesta" | Si `retry_count >= 1` -> SALIDA_ELEGANTE; si no -> **INFO_REINTENTO** | INFO_REINTENTO (o SALIDA_ELEGANTE) |
| No claro (resto) | Primera vez sin retry | **INFO_REINTENTO** | INFO_REINTENTO |
| No claro (resto) | Ya había retry (`retry_count` existe) | **SALIDA_ELEGANTE** | SALIDA_ELEGANTE |

**Datos que se guardan:**
- Alta intención: `intencion`, `perfil_compra` (inversion / construir_casa).
- Solo info primera vez: `intencion: 'solo_info'`, `retry_count: 1`.
- No claro primera vez: `retry_count: 1`.
- Salida elegante: `lead_quality: 'BAJO'`, `disqualified_reason`.

---

## Flujo 3: INFO_REINTENTO

**Cuándo se entra:** Desde FILTRO_INTENCION cuando el usuario fue clasificado como "solo info" o "no claro" (primera vez).

**Handler:** `handleInfoReintento(messageText, development, userPhone, userData)`.

**Qué envía el bot (según rama):** Ver tabla.

**Transiciones:**

| Tipo de respuesta detectada | Siguiente estado | Mensaje(s) que envía el bot |
|-----------------------------|------------------|-----------------------------|
| Afirmativo / recuperado | keywords o LLM: comprar, invertir, mixto, o texto con "si", "sí", "claro", "construir", "me interesa", "quiero" | **CTA_PRIMARIO** | CONFIRMACION_COMPRA + CTA_VISITA_O_CONTACTO |
| Sigue en solo info / duda / no | Cualquier otro caso | **SALIDA_ELEGANTE** | SALIDA_ELEGANTE |

**Datos que se guardan:**
- Recuperado: `intencion: 'recuperado_de_info'`, `perfil_compra: 'inversion'`.
- Salida: `lead_quality: 'BAJO'`, `disqualified_reason: 'insiste_solo_info'`.

---

## Flujo 4: CTA_PRIMARIO

**Cuándo se entra:** Desde FILTRO_INTENCION (alta intención) o desde INFO_REINTENTO (recuperado). El bot acaba de enviar confirmación + "¿Visitar el desarrollo o que un agente te contacte?".

**Handler:** `handleCtaPrimario(messageText, development, userPhone)`.

**Transiciones (orden de evaluación en código):**

| Orden | Tipo de respuesta detectada | Siguiente estado | Mensaje(s) que envía el bot | user_data que se guarda |
|-------|-----------------------------|------------------|-----------------------------|-------------------------|
| 1 | Negativo (no gracias, luego, ahora no, no quiero, etc.) | **SALIDA_ELEGANTE** | SALIDA_ELEGANTE | lead_quality BAJO, disqualified_reason |
| 2 | "Visitar" (visita, ir a ver, conocer el desarrollo, etc.) | **SOLICITUD_HORARIO** | SOLICITUD_HORARIO | preferred_action: 'visita', preferred_channel: undefined |
| 3 | Canal explícito: **llamada** (por teléfono, que me llamen, etc.) | **SOLICITUD_NOMBRE** (short-circuit; no se pide horario) | SOLICITUD_NOMBRE | preferred_action: 'contactado', preferred_channel: 'llamada' |
| 4 | Canal explícito: **videollamada** (video, zoom, meet) | **SOLICITUD_HORARIO** | SOLICITUD_FECHA_HORARIO (o SOLICITUD_HORARIO) | preferred_action: 'contactado', preferred_channel: 'videollamada' |
| 5 | "Contactado" genérico (que me contacten, un agente, etc.) o afirmativo (sí, claro, agendar) sin canal | **CTA_CANAL** | CTA_CANAL ("¿Por llamada telefónica o por videollamada?") | preferred_action: 'contactado' (sin canal aún) |
| 6 | Ambiguo (no coincide con lo anterior) | **SALIDA_ELEGANTE** | SALIDA_ELEGANTE | lead_quality BAJO, disqualified_reason |

**Resumen de posibilidades desde CTA_PRIMARIO:**

- A **SOLICITUD_HORARIO**: si eligió visitar O si eligió videollamada (short-circuit).
- A **SOLICITUD_NOMBRE**: si eligió llamada (short-circuit).
- A **CTA_CANAL**: si eligió "ser contactado" sin decir canal.
- A **SALIDA_ELEGANTE**: negativo o ambiguo.

---

## Flujo 5: CTA_CANAL

**Cuándo se entra:** Desde CTA_PRIMARIO cuando el usuario dijo "que me contacten" (o similar) pero no especificó llamada ni videollamada.

**Handler:** `handleCtaCanal(messageText, development, userPhone)`.

**Transiciones:**

| Tipo de respuesta detectada | Siguiente estado | Mensaje(s) que envía el bot | user_data |
|-----------------------------|------------------|-----------------------------|-----------|
| Negativo | **SALIDA_ELEGANTE** | SALIDA_ELEGANTE | lead_quality BAJO |
| Llamada (por teléfono, que me llamen, etc.) | **SOLICITUD_NOMBRE** | SOLICITUD_NOMBRE | preferred_action: 'contactado', preferred_channel: 'llamada' |
| Videollamada (video, zoom, meet) | **SOLICITUD_HORARIO** | SOLICITUD_FECHA_HORARIO | preferred_action: 'contactado', preferred_channel: 'videollamada' |
| Afirmativo genérico ("sí", "ok") sin canal | **SOLICITUD_HORARIO** (default videollamada) | SOLICITUD_FECHA_HORARIO | preferred_channel: 'videollamada' |
| Ambiguo | **SALIDA_ELEGANTE** | SALIDA_ELEGANTE | lead_quality BAJO |

---

## Flujo 6: SOLICITUD_HORARIO

**Cuándo se entra:**
- Desde CTA_PRIMARIO: usuario eligió "visitar" (entonces se pide horario genérico) o "videollamada" (se pide día y horario).
- Desde CTA_CANAL: usuario eligió videollamada o dijo "sí" (default videollamada).

**Handler:** `handleSolicitudHorario(messageText, development, userPhone)`.

**Comportamiento:** Se acepta **cualquier texto** como horario (texto libre). No hay ramas por tipo de respuesta.

**Transición (única):**

| Respuesta del usuario | Siguiente estado | Mensaje(s) que envía el bot |
|-----------------------|------------------|-----------------------------|
| Cualquier texto (incluso una palabra) | **SOLICITUD_NOMBRE** | SOLICITUD_NOMBRE |

**Datos que se guardan:** `horario_preferido: messageText.trim() || 'No indicado'`.

---

## Flujo 7: SOLICITUD_NOMBRE

**Cuándo se entra:**
- Desde SOLICITUD_HORARIO (tras indicar horario).
- Desde CTA_PRIMARIO o CTA_CANAL con canal "llamada" (short-circuit, sin pasar por horario).

**Handler:** `handleSolicitudNombre(messageText, development, userPhone, userData, phoneNumberId)`.

**Transiciones:**

| Condición | Siguiente estado | Mensaje(s) que envía el bot |
|-----------|------------------|-----------------------------|
| Nombre con menos de 3 caracteres | **SOLICITUD_NOMBRE** (se queda) | "Por favor, ¿me podrías decir tu nombre para decirle al asesor?" |
| Nombre con 3+ caracteres | **CLIENT_ACCEPTA** | Brochure (PDF si existe) + HANDOVER_EXITOSO; además se ejecuta handover (Zoho CRM, Cliq, markQualified) |

**Datos que se guardan:** `name` (nombre completo). En CLIENT_ACCEPTA además: lead en CRM, canal Cliq, `is_qualified`, etc.

---

## Flujo 8: CLIENT_ACCEPTA

**Cuándo se entra:** Tras dar nombre válido en SOLICITUD_NOMBRE; se ejecuta `handleClientAccepta` (crear lead, canal Cliq, marcar calificado).

**Comportamiento:** El bot **no responde** a nuevos mensajes. `handleIncomingMessage` devuelve `outboundMessages: []` cuando `state === 'CLIENT_ACCEPTA'` o `is_qualified === true`. La conversación queda en manos del asesor (Cliq <-> WhatsApp).

**Transiciones:** Ninguna. Es estado final para el bot.

---

## Flujo 9: SALIDA_ELEGANTE

**Cuándo se entra:** Desde FILTRO_INTENCION (info_loop o unclear_intent), INFO_REINTENTO (insiste_solo_info), CTA_PRIMARIO (rechazo o ambiguo), CTA_CANAL (rechazo o ambiguo).

**Handler:** `handleSalidaElegante(development, userPhone, reason)`. Envía mensaje SALIDA_ELEGANTE y guarda `lead_quality: 'BAJO'`, `disqualified_reason`.

**Comportamiento especial:** No se evalúa el mensaje del usuario en este estado. En `handleIncomingMessage`, cuando `conversation.state === 'SALIDA_ELEGANTE'`, **antes** de llamar a `processState` se hace:
1. `updateState(userPhone, development, 'INICIO')`
2. `return await handleInicio(development, userPhone)`

Es decir: **cualquier** mensaje nuevo del usuario después de SALIDA_ELEGANTE reinicia la conversación a INICIO y se muestra de nuevo la bienvenida.

**Transición efectiva:**

| Respuesta del usuario | Siguiente estado |
|-----------------------|------------------|
| Cualquier mensaje     | **INICIO** (y luego FILTRO_INTENCION con bienvenida) |

---

## Resumen visual por estado (a qué se puede pasar)

```
INICIO
  └── (siempre) FILTRO_INTENCION

FILTRO_INTENCION
  ├── saludo solo        -> FILTRO_INTENCION
  ├── comprar/invertir   -> CTA_PRIMARIO
  ├── solo info (1ra)    -> INFO_REINTENTO
  ├── solo info (2da)    -> SALIDA_ELEGANTE
  ├── no claro (1ra)     -> INFO_REINTENTO
  └── no claro (2da)     -> SALIDA_ELEGANTE

INFO_REINTENTO
  ├── sí / comprar / invertir -> CTA_PRIMARIO
  └── resto                 -> SALIDA_ELEGANTE

CTA_PRIMARIO
  ├── negativo      -> SALIDA_ELEGANTE
  ├── visitar       -> SOLICITUD_HORARIO
  ├── llamada       -> SOLICITUD_NOMBRE
  ├── videollamada  -> SOLICITUD_HORARIO
  ├── contactado/sí -> CTA_CANAL
  └── ambiguo       -> SALIDA_ELEGANTE

CTA_CANAL
  ├── negativo      -> SALIDA_ELEGANTE
  ├── llamada       -> SOLICITUD_NOMBRE
  ├── videollamada  -> SOLICITUD_HORARIO
  ├── sí (default)  -> SOLICITUD_HORARIO
  └── ambiguo       -> SALIDA_ELEGANTE

SOLICITUD_HORARIO
  └── cualquier texto -> SOLICITUD_NOMBRE

SOLICITUD_NOMBRE
  ├── nombre < 3 chars -> SOLICITUD_NOMBRE
  └── nombre >= 3 chars -> CLIENT_ACCEPTA

CLIENT_ACCEPTA
  └── (bot no responde)

SALIDA_ELEGANTE
  └── cualquier mensaje (siguiente turno) -> INICIO -> FILTRO_INTENCION
```

---

## Nota sobre el LLM

En los estados FILTRO_INTENCION, INFO_REINTENTO, CTA_PRIMARIO, SOLICITUD_HORARIO y SOLICITUD_NOMBRE se intenta primero `selectResponseAndState` (LLM). Solo si el LLM devuelve un `nextState` que está en la allowlist y no dispara anti-repeat, se usa esa transición. En caso contrario se usa el handler FSM (keywords + clasificadores) descrito arriba.

El LLM selector recibe **solo** las opciones válidas para el estado actual (`STATE_LLM_CONFIG` en `response-selector.ts`): 3–5 `responseKeys` y 2–4 `nextStates` posibles, no las 15+ opciones globales. Esto reduce errores de clasificación.

## Anti-loop: stuck_in_state_count

`processState` es un wrapper que mantiene el contador `stuck_in_state_count` en `user_data`:

- Se **incrementa** cuando `nextState === currentState` (el estado no avanzó).
- Se **resetea a 0** cuando el estado cambia.
- Si llega a **≥ 3**, antes de ejecutar ningún handler, se fuerza **SALIDA_ELEGANTE** con razón `'loop_detected'`.

Esto garantiza que ningún usuario quede atrapado indefinidamente en un estado, incluso si el LLM o el FSM fallback no logran clasificar correctamente los mensajes.
