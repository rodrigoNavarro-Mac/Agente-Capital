# Base de datos — Esquema y funciones

PostgreSQL alojado en Supabase. En producción se usa **Transaction pooling** (puerto 6543) para compatibilidad con funciones serverless de Vercel.

Todas las funciones de acceso a BD están centralizadas en `src/lib/db/postgres.ts`.

---

## Tablas principales

### Autenticación y usuarios

| Tabla | Descripción | Migración |
|---|---|---|
| `users` | Usuarios del sistema (email, password hash, rol, desarrollos asignados) | 001 |
| `roles` | Roles disponibles (`admin`, `manager`, `asesor`) | 002 |
| `sessions` | Refresh tokens activos por usuario | 001 |

### WhatsApp — conversaciones y logs

| Tabla | Descripción | Migración |
|---|---|---|
| `whatsapp_conversations` | Estado actual de cada conversación (una fila por usuario+desarrollo) | 037 |
| `whatsapp_logs` | Historial de mensajes enviados y recibidos | 036, 038 |
| `whatsapp_state_transitions` | Historial de transiciones de estado FSM | 046 |
| `whatsapp_cliq_threads` | Canales de Cliq asociados a conversaciones cualificadas | 039–044 |
| `whatsapp_message_dedup` | Deduplicación de mensajes entrantes | 045 |
| `whatsapp_bridge_logs` | Logs del bridge bidireccional WhatsApp-Cliq | 042 |

### Zoho CRM

| Tabla | Descripción | Migración |
|---|---|---|
| `zoho_leads` | Cache local de leads de Zoho CRM | 007 |
| `zoho_deals` | Cache local de deals de Zoho CRM | 007 |
| `zoho_sync_log` | Log de sincronizaciones con Zoho | 007 |
| `zoho_notes` | Notas de deals con análisis de IA | 008, 010 |

### Comisiones

| Tabla | Descripción | Migración |
|---|---|---|
| `commissions` | Comisiones por venta | 011 |
| `commission_distributions` | Distribución de comisiones por asesor/fase | 011, 024 |
| `commission_rules` | Reglas de cálculo de comisiones por desarrollo | 013, 015 |
| `commission_billing_targets` | Metas de facturación | 018 |
| `commission_sales_targets` | Metas de ventas | 023 |
| `commission_hidden_partners` | Partners ocultos en vistas | 031 |
| `product_partners` | Partners por producto | 022 |

### Otros

| Tabla | Descripción | Migración |
|---|---|---|
| `query_cache` | Cache de respuestas RAG | 003 |
| `page_visits` | Tracking de visitas a páginas del dashboard | 021 |
| `llm_provider_config` | Configuración del proveedor LLM activo | 006 |

---

## Tabla: `whatsapp_conversations`

```sql
CREATE TABLE whatsapp_conversations (
  id SERIAL PRIMARY KEY,
  user_phone VARCHAR(20) NOT NULL,
  development VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL DEFAULT 'INICIO',
  user_data JSONB DEFAULT '{}',          -- nombre, intencion, horario, etc.
  is_qualified BOOLEAN DEFAULT FALSE,
  cliq_channel_id VARCHAR(255),
  cliq_thread_id VARCHAR(255),
  context_sent_at TIMESTAMP WITH TIME ZONE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_phone, development)
);
```

`user_data` acumula datos del usuario a lo largo del flujo:
```json
{
  "nombre": "Juan Pérez",
  "intencion": "compra",
  "horario": "martes por la tarde",
  "canal": "llamada"
}
```

---

## Tabla: `whatsapp_state_transitions`

Registrada con la migración 046. Guarda cada cambio de estado de la FSM.

```sql
CREATE TABLE whatsapp_state_transitions (
  id SERIAL PRIMARY KEY,
  user_phone VARCHAR(20) NOT NULL,
  development VARCHAR(100) NOT NULL,
  from_state VARCHAR(50),               -- NULL = estado inicial
  to_state VARCHAR(50) NOT NULL,
  trigger_message TEXT,                 -- mensaje del usuario que causó el cambio
  response_key VARCHAR(100),            -- clave del banco de mensajes enviada
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'system',
  reasoning TEXT,                       -- razonamiento del LLM (si aplica)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_wa_state_transitions_phone_dev_at
  ON whatsapp_state_transitions(user_phone, development, created_at DESC);
```

Valores de `triggered_by`:

| Valor | Cuando se usa |
|---|---|
| `llm` | El LLM response selector eligió el siguiente estado |
| `keyword` | Se detectó una keyword (FAQ, canal, etc.) |
| `fsm` | El handler FSM decidió por lógica determinista |
| `anti_loop` | Anti-loop protection activó SALIDA_ELEGANTE |
| `reset` | Comando `/reset` del usuario |
| `system` | Acción del sistema (nueva conversación, salida → reinicio) |

La escritura es **fire-and-forget** (no bloquea el flujo del bot). Si la tabla no existe (migración pendiente), la función falla silenciosamente.

---

## Funciones DB clave (`src/lib/db/postgres.ts`)

### Conversaciones WhatsApp

```typescript
getConversation(userPhone: string, development: string): Promise<ConversationRow | null>
upsertConversation(userPhone: string, development: string, state: string, userData?: object): Promise<void>
updateState(userPhone: string, development: string, state: string, userData?: object): Promise<void>
markQualified(userPhone: string, development: string): Promise<void>
resetConversation(userPhone: string, development: string): Promise<void>
getConversations(filters): Promise<ConversationRow[]>
deleteConversation(userPhone: string, development: string): Promise<void>
```

### Historial de estados

```typescript
saveStateTransition(data: {
  user_phone: string;
  development: string;
  from_state: string | null;
  to_state: string;
  trigger_message?: string;
  response_key?: string;
  triggered_by: 'llm' | 'keyword' | 'fsm' | 'anti_loop' | 'reset' | 'system';
  reasoning?: string;
}): Promise<void>

getStateTransitions(
  user_phone: string,
  development: string,
  limit?: number        // default 50, max 200
): Promise<StateTransitionRow[]>
```

### Logs de WhatsApp

```typescript
saveWhatsAppLog(data: WhatsAppLogData): Promise<void>
getWhatsAppLogs(filters): Promise<WhatsAppLogRow[]>
getConversationLogs(userPhone: string, development: string, limit?: number): Promise<WhatsAppLogRow[]>
```

### Zoho y bridge Cliq

```typescript
saveCliqThread(userPhone: string, development: string, threadId: string, channelId?: string): Promise<void>
getCliqThread(userPhone: string, development: string): Promise<CliqThreadRow | null>
saveBridgeLog(data: BridgeLogData): Promise<void>
```

---

## Migraciones

Las migraciones son archivos SQL numerados en `migrations/`. Se ejecutan en orden ascendente.

```bash
npm run db:migrate        # Aplica migraciones pendientes
npm run db:migrate:all    # Aplica todas desde 001
```

Rango de migraciones por módulo:

| Rango | Módulo |
|---|---|
| 001–006 | Core: usuarios, roles, sesiones, cache, LLM config |
| 007–010 | Zoho CRM: leads, deals, notas, AI insights |
| 011–035 | Comisiones (fases, distribuciones, reglas, billing) |
| 036–046 | WhatsApp: logs, conversaciones, Cliq bridge, dedup, state transitions |

> **Nota:** Algunos números están duplicados por ramas paralelas (ej. hay dos `008_`). En esos casos ambas migraciones son seguras de aplicar (usan `IF NOT EXISTS`).
