# Reiniciar Conversación en Desarrollo

## Opción 1: Comando /reset (Más Fácil)

Simplemente envía `/reset` por WhatsApp y la conversación se reiniciará automáticamente.

```
Tú: /reset
Bot: 🔄 Conversación reiniciada (Modo Humanizado + Nombre).
Tú: Hola
Bot: [Mensaje de bienvenida FUEGO]
```

## Opción 2: SQL Manual

Conecta a PostgreSQL y ejecuta:

```sql
-- Ver conversaciones activas
SELECT user_phone, development, state, lead_quality, created_at 
FROM whatsapp_conversations 
ORDER BY created_at DESC;

-- Reiniciar conversación específica
DELETE FROM whatsapp_conversations 
WHERE user_phone = '5212221234567' AND development = 'FUEGO';

-- Reiniciar TODAS las conversaciones (¡cuidado en producción!)
TRUNCATE whatsapp_conversations;
```

## Opción 3: Script Node.js

Crear `scripts/reset-whatsapp-conversation.ts`:

```typescript
import { resetConversation } from '@/lib/modules/whatsapp/conversation-state';

const phone = process.argv[2];
const development = process.argv[3] || 'FUEGO';

if (!phone) {
  console.log('Uso: npx tsx scripts/reset-whatsapp-conversation.ts <phone> [development]');
  process.exit(1);
}

resetConversation(phone, development).then(() => {
  console.log(`✅ Conversación reiniciada: ${phone} - ${development}`);
  process.exit(0);
});
```

Uso:
```bash
npx tsx scripts/reset-whatsapp-conversation.ts 5212221234567 FUEGO
```

## Para Testing Rápido

Durante desarrollo, usa `/reset` en WhatsApp:
1. Conversación llega a cualquier estado
2. Envías `/reset`
3. Bot elimina el registro en DB
4. Próximo mensaje inicia desde INICIO

---

**Recomendación:** Usa `/reset` para pruebas rápidas. Para producción, elimina esta funcionalidad o restringe a números admin.
