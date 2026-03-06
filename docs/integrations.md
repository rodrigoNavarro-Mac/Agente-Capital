# Integraciones externas

---

## WhatsApp Cloud API (Meta)

**Archivo:** `src/lib/modules/whatsapp/whatsapp-client.ts`

El bot usa la **WhatsApp Cloud API** de Meta. El backend expone dos endpoints:

| Endpoint | Método | Propósito |
|---|---|---|
| `/api/webhooks/whatsapp` | GET | Verificación del webhook (challenge) |
| `/api/webhooks/whatsapp` | POST | Recibe eventos (mensajes, status updates) |

### Variables de entorno

```env
WHATSAPP_VERIFY_TOKEN=token_para_verificacion_del_webhook
WHATSAPP_API_TOKEN=token_de_acceso_de_la_app_de_meta
# Por desarrollo (una variable por número de teléfono):
WHATSAPP_PHONE_NUMBER_ID_FUEGO=...
WHATSAPP_PHONE_NUMBER_ID_AMURA=...
WHATSAPP_PHONE_NUMBER_ID_PUNTO_TIERRA=...
```

### Tipos de mensajes enviados

- **Texto:** `sendTextMessage(to, text, phoneNumberId)`
- **Imagen:** `sendImageMessage(to, imageUrl, caption, phoneNumberId)` — requiere URL pública, límite 5 MB
- **Documento PDF:** `sendDocumentMessage(to, documentUrl, filename, phoneNumberId)`

### Routing multi-desarrollo

`channel-router.ts` mapea `phone_number_id` → `{ development, zone }`. El desarrollo determina el contenido (mensajes, imagen hero, brochure PDF).

---

## Zoho CRM

**Archivos:** `src/lib/modules/whatsapp/zoho-lead-activation.ts`, `src/app/api/zoho/`

Cuando un lead es cualificado (usuario da su nombre), el bot:
1. Crea un **Lead** en Zoho CRM con los datos recopilados (nombre, teléfono, intención, desarrollo, horario)
2. Crea un **canal en Zoho Cliq** para el asesor asignado
3. Postea el contexto de la conversación en ese canal

### OAuth 2.0

Zoho usa refresh token flow. El access token se renueva automáticamente antes de cada llamada.

```env
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com   # Solo URL base, sin rutas
ZOHO_CRM_API_URL=https://www.zohoapis.com/crm/v2
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
```

> Regiones: US = `accounts.zoho.com`, EU = `accounts.zoho.eu`, IN = `accounts.zoho.in`

### Sincronización periódica

`POST /api/cron/sync-zoho` — cron job que sincroniza leads y deals de Zoho a la BD local. Configurado en `vercel.json`.

---

## Zoho Cliq — Bridge bidireccional

**Archivos:** `src/app/api/webhooks/cliq/route.ts`, `src/lib/modules/whatsapp/zoho-lead-activation.ts`

Cuando un lead es cualificado el bot:
1. Crea un canal en Cliq con nombre `WA-{phone}-{development}`
2. Postea el resumen de la conversación (contexto extraído por Anthropic) en ese canal
3. El asesor puede responder desde Cliq → el mensaje llega al usuario por WhatsApp (bridge)

El bridge es bidireccional:
- **WhatsApp → Cliq:** mensajes del usuario después del handover se reenvían al canal del asesor
- **Cliq → WhatsApp:** mensajes del asesor en el canal se reenvían al usuario por WhatsApp

### Variables de entorno Cliq

```env
ZOHO_CLIQ_WEBHOOK_TOKEN=...         # Token de validación del webhook de Cliq
ZOHO_CLIQ_BOT_WEBHOOK_URL=...       # URL del incoming webhook del bot en Cliq
ZOHO_CLIQ_API_URL=https://cliq.zoho.com/api/v2
```

Documentación del webhook Deluge: [docs/cliq-bot-incoming-webhook-deluge.md](./cliq-bot-incoming-webhook-deluge.md)

---

## OpenAI

**Archivo:** `src/lib/services/llm.ts`

Usado para:
- **Response selector** (`response-selector.ts`): el LLM elige la clave de respuesta y el siguiente estado FSM dado el mensaje del usuario y el estado actual. Devuelve JSON: `{"responseKey":"...","nextState":"...","reasoning":"..."}`
- **Intent classifier** (`intent-classifier.ts`): clasifica la intención del usuario (compra / inversión / solo_info)

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   # Modelo por defecto
```

El wrapper `runLLM` soporta alternativamente **LM Studio** (inferencia local):

```env
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M
```

Si `LMSTUDIO_BASE_URL` está definido, se usa LM Studio; si no, OpenAI.

---

## Anthropic Claude

**Archivo:** `src/lib/modules/whatsapp/context-extractor.ts`

Usado exclusivamente para **extraer el contexto estructurado** de la conversación antes de crear el lead en Zoho y el canal en Cliq. Genera un resumen legible de los datos del lead (nombre, intención, horario, canal preferido) para postear al asesor.

```env
ANTHROPIC_API_KEY=sk-ant-...
# Modelo por defecto: claude-haiku-4-5-20251001
```

---

## Pinecone + HuggingFace (RAG)

El sistema RAG original (chat con documentos corporativos) usa:

```env
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=capitalplus-rag
HUGGINGFACE_API_KEY=...    # Para generación de embeddings
```

> Este módulo está activo pero separado del bot de WhatsApp. Se accede desde `/api/rag-query` y la UI de chat del dashboard.
