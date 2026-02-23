# Migraciones necesarias para el bot de WhatsApp

Si el bot **siempre repite el mensaje de bienvenida** ("¿te interesa invertir o construir?") y no avanza al dar "invertir" o "comprar", es porque en la base de datos de producción **no existe la tabla donde se guarda el estado de la conversación**.

## Qué hacer

Ejecuta estas migraciones **en la misma base de datos que usa tu app en Vercel** (la que apunta `POSTGRES_URL` o `DATABASE_URL`).

### 1. Crear la tabla de conversaciones (obligatorio para que el flujo avance)

En **Supabase**: Dashboard → SQL Editor → New query.

Copia y pega el contenido de **`037_whatsapp_conversations.sql`** y ejecuta.

### 2. Métricas de logs (recomendado, evita errores en logs)

Copia y pega el contenido de **`038_whatsapp_logs_performance.sql`** y ejecuta.

## Cómo comprobar

Después de desplegar de nuevo en Vercel:

1. Envía un primer mensaje al bot (ej. "hola") → debe responder con la bienvenida.
2. Envía "invertir" o "comprar" → debe responder con el mensaje de confirmación y la pregunta de visita/llamada (ya no la bienvenida).

En los logs de Vercel deberías ver algo como:
- `Conversation state loaded` con `state: 'FILTRO_INTENCION'` en el segundo mensaje (ya no `state: 'NEW'`).
