# Tests de flujos WhatsApp

Tests internos para los flujos de conversación. **No se llama a la API de WhatsApp** ni a la base real; se usan mocks para DB, LLM, Zoho y Cliq.

## Cómo ejecutar

```bash
npm install
npm run test
```

Modo watch (re-ejecuta al guardar):

```bash
npm run test:watch
```

## Qué se prueba

### 1. `conversation-keywords.test.ts` (unit)

- **normalizeForMatch**: minúsculas, espacios, acentos.
- **matchIntentByKeywords**: comprar / invertir / solo_info / mixto según palabras clave.
- **matchAffirmativeByKeywords** y **matchNegativeByKeywords**.
- **matchCtaPrimarioByKeywords**: visitar vs contactado.
- **matchCtaCanalByKeywords**: llamada vs videollamada.

Sin mocks; solo funciones puras.

### 2. `conversation-flows.test.ts` (flujo con mocks)

- **Store en memoria**: sustituye a la base; cada test puede fijar estado inicial y comprobar el siguiente.
- **Mocks**:
  - `conversation-state`: getConversation, upsertConversation, updateState, mergeUserData, resetConversation, markQualified.
  - `intent-classifier`: classifyIntent, classifyCtaPrimario, classifyCtaCanal (retornan `null` para usar solo keywords).
  - `response-selector`: selectResponseAndState (retorna `null` para usar FSM).
  - Zoho CRM, Zoho Cliq, media-handler, whatsapp-cliq, postgres, channel-router (no llaman a APIs reales).

Escenarios:

- `/reset`: mensaje de reinicio y estado borrado.
- Nueva conversación "hola": BIENVENIDA y estado FILTRO_INTENCION.
- FILTRO_INTENCION → "invertir" / "construir": confirmación + CTA, estado CTA_PRIMARIO.
- CTA_PRIMARIO → "visitar": SOLICITUD_HORARIO.
- CTA_PRIMARIO → "llamada": short-circuit a SOLICITUD_NOMBRE (sin horario).
- CTA_PRIMARIO → "contactar un agente": CTA_CANAL.
- CTA_CANAL → "llamada": SOLICITUD_NOMBRE.
- CTA_CANAL → "videollamada": SOLICITUD_HORARIO (fecha/horario).
- SOLICITUD_HORARIO → texto libre: SOLICITUD_NOMBRE.
- SOLICITUD_NOMBRE → nombre &lt; 3 caracteres: se repide nombre, mismo estado.
- SOLICITUD_NOMBRE → nombre válido: handover (CLIENT_ACCEPTA, shouldCreateLead, mensaje de despedida).
- CTA_PRIMARIO → "no gracias": SALIDA_ELEGANTE.
- FILTRO_INTENCION → "solo precios": INFO_REINTENTO.
- Flujo completo: hola → invertir → contactado → videollamada → horario → nombre → CLIENT_ACCEPTA.

En cada caso se comprueba:

- `result.nextState` (y, donde aplica, estado en store).
- Que los mensajes que enviaría el bot (`outboundMessages`) tengan el contenido esperado (p. ej. que incluyan "nombre", "horario", "videollamada", etc.), sin enviar nada por WhatsApp.
