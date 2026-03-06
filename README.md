# Capital+ Agente

Plataforma interna para Capital+ que combina un **bot de WhatsApp para calificación de leads inmobiliarios** con un **dashboard de gestión** para asesores y administradores.

## Módulos principales

| Módulo | Descripción | Documentación |
|---|---|---|
| Bot WhatsApp | FSM de calificación de leads, FAQ router, LLM response selector, bridge a Zoho Cliq | [docs/whatsapp-bot.md](docs/whatsapp-bot.md) |
| Motor conversacional | Arquitectura detallada: entrada, FSM, LLM, handover | [docs/conversational-engine-architecture.md](docs/conversational-engine-architecture.md) |
| FSM (estados) | Diagrama Mermaid y descripción de cada estado | [docs/fsm-mermaid.md](docs/fsm-mermaid.md) |
| FSM (transiciones) | Tabla de transiciones, triggers, condiciones | [docs/fsm-transiciones-detalle.md](docs/fsm-transiciones-detalle.md) |
| Base de datos | Esquema PostgreSQL, migraciones 001–046, funciones clave | [docs/database.md](docs/database.md) |
| Integraciones | Zoho CRM, Zoho Cliq, OpenAI, Anthropic | [docs/integrations.md](docs/integrations.md) |
| Configuración | Setup local y Vercel (variables de entorno, DB, migraciones) | [docs/setup.md](docs/setup.md) |
| Reset de conversación | Comando `/reset` y comportamiento de reinicio | [docs/whatsapp-reset-conversation.md](docs/whatsapp-reset-conversation.md) |

## Stack tecnológico

- **Framework:** Next.js 14 (App Router, serverless)
- **BD:** PostgreSQL vía Supabase (Transaction pooling en producción)
- **LLM:** OpenAI (`gpt-4o-mini` por defecto) para response selector e intent classifier; Anthropic Claude para context extractor
- **WhatsApp:** WhatsApp Cloud API (Meta)
- **CRM:** Zoho CRM + Zoho Cliq
- **Auth:** JWT (access + refresh tokens), roles: `admin`, `manager`, `asesor`
- **Deploy:** Vercel

## Estructura del proyecto

```
src/
  app/
    api/
      webhooks/whatsapp/     # POST — recibe eventos de WhatsApp Cloud API
      webhooks/cliq/         # POST — recibe mensajes de asesores desde Cliq
      whatsapp/
        conversations/       # CRUD + state-history + retry endpoints
        logs/                # Historial de mensajes por conversación
        metrics/stats/       # KPIs del bot
      auth/                  # login, logout, refresh, reset-password
      zoho/                  # leads, deals, notes, sync
      commissions/           # módulo de comisiones
      cron/                  # sync-zoho, process-feedback-learning
    dashboard/
      conversaciones/        # Vista de conversaciones de WhatsApp
      comisiones/            # Módulo de comisiones
      zoho/                  # Vista de leads y deals
  lib/
    modules/
      whatsapp/              # Toda la lógica del bot
        conversation-flows.ts    # Orquestador principal (FSM handlers)
        response-selector.ts     # LLM elige respuesta y siguiente estado
        intent-classifier.ts     # Clasifica intención del usuario
        context-extractor.ts     # Extrae datos del usuario (Anthropic)
        development-content.ts   # Banco de mensajes por desarrollo
        whatsapp-client.ts       # HTTP client para WhatsApp Cloud API
        channel-router.ts        # phone_number_id -> desarrollo + zona
        conversation-state.ts    # Definición de estados FSM
        webhook-handler.ts       # Parse y validación del payload Meta
        conversation-keywords.ts # Detección de keywords (FAQ, canal, etc.)
        zoho-lead-activation.ts  # Crea lead en Zoho + canal en Cliq
        conversation-access.ts   # RBAC para endpoints del dashboard
    db/
      postgres.ts            # Todas las funciones de acceso a BD
    auth/                    # JWT, cookies, sesiones
    services/
      llm.ts                 # Wrapper unificado (OpenAI / LM Studio)
  migrations/                # SQL ordenados 001–046
```

## Comandos rápidos

```bash
# Desarrollo
npm run dev

# Build
npm run build

# Migraciones
npm run db:migrate        # Aplica la migración más reciente
npm run db:migrate:all    # Aplica todas las pendientes

# Tests
npm test
npm run test:whatsapp     # Tests de flujos WhatsApp
```

## Variables de entorno mínimas

```env
# BD
DATABASE_URL=postgresql://...

# LLM
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Anthropic (context extractor)
ANTHROPIC_API_KEY=sk-ant-...

# WhatsApp
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_API_TOKEN=...

# Auth
JWT_SECRET=...
JWT_REFRESH_SECRET=...

# Zoho
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_CRM_API_URL=https://www.zohoapis.com/crm/v2
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
```

Lista completa y configuración por entorno: [docs/setup.md](docs/setup.md)
