# WA|BOT — Incoming Webhook Handler (pegar en Cliq)

En Zoho Cliq: **Bots** → bot **WA|BOT** → **Incoming Webhook Handler** → borra todo lo que haya y pega exactamente el siguiente código.

---

## Código a pegar (completo)

```
bridge_secret = "";

response = Map();
bodyMap = body;
if (bodyMap == null) {
  bodyMap = Map();
}

if (bridge_secret.length() > 0) {
  token = null;
  if (headers != null) {
    if (headers.get("X-Bridge-Token") != null) {
      token = headers.get("X-Bridge-Token");
    } else if (headers.get("x-bridge-token") != null) {
      token = headers.get("x-bridge-token");
    }
  }
  if (token == null && bodyMap.get("secret") != null) {
    token = bodyMap.get("secret");
  }
  if (token == null || !token.equals(bridge_secret)) {
    response.put("ok", false);
    response.put("reason", "invalid_token");
    return response;
  }
}

channel_id = bodyMap.get("channel_id");
if (channel_id == null) { channel_id = ""; }
channel_unique_name = bodyMap.get("channel_unique_name");
if (channel_unique_name == null) { channel_unique_name = ""; }
user_name = bodyMap.get("user_name");
if (user_name == null) { user_name = "Cliente"; }
user_phone = bodyMap.get("user_phone");
if (user_phone == null) { user_phone = ""; }
text = bodyMap.get("text");
if (text == null) { text = ""; }
development = bodyMap.get("development");
if (development == null) { development = ""; }
crm_lead_url = bodyMap.get("crm_lead_url");
if (crm_lead_url == null) { crm_lead_url = ""; }
wa_message_id = bodyMap.get("wa_message_id");
if (wa_message_id == null) { wa_message_id = ""; }

if (channel_unique_name.isEmpty()) {
  response.put("ok", false);
  response.put("reason", "missing_channel_unique_name");
  return response;
}

formatted = "[WA-IN] " + user_name + " (" + user_phone + ")\n" + text + "\nDEV:" + development + "\nCRM:" + crm_lead_url;
zoho.cliq.postToChannel(channel_unique_name, formatted);

response.put("ok", true);
response.put("channel_id", channel_id);
response.put("wa_message_id", wa_message_id);
return response;
```

---

## Sin CLIQ_BRIDGE_SECRET (ahora)

- La primera línea queda: `bridge_secret = "";`
- No agregues nada en el `.env`. El backend puede no enviar header de token; el bot acepta todas las llamadas.
- Úsalo así para probar. Cuando quieras proteger el webhook, sigue el apartado siguiente.

## Cuando quieras usar secreto

1. En el script, cambia la primera línea por (elige una frase y usala igual en los dos sitios):
   `bridge_secret = "una_frase_secreta_que_elijas";`
2. En tu `.env` agrega:
   `CLIQ_BRIDGE_SECRET=una_frase_secreta_que_elijas`
   (la misma frase que en el script).
3. Reinicia o redespliega el backend para que cargue la variable.

Guardar el handler en Cliq y listo.

---

## Donde probar (con el backend ya conectado)

**Requisito:** En tu `.env` (o en el entorno donde corre el backend) debe estar la URL del bot de Cliq:
- `CLIQ_BOT_INCOMING_WEBHOOK_URL=https://...` (la URL que te da Cliq en el Incoming Webhook del WA|BOT).

Opcional para que se invite un asesor al canal: `CLIQ_AGENT_BY_DEVELOPMENT={"FUEGO":"email@ejemplo.com"}`.  
Para que un usuario (monitor) esté en **todos** los canales: `CLIQ_ALWAYS_INVITE_EMAILS=email-del-monitor@empresa.com` (varios: separados por coma). La API de Cliq usa emails; si el usuario es 895282745, usa el email de ese usuario en Zoho.

### 1. Crear lead + canal (WhatsApp)

1. Desde el numero de WhatsApp que tengas vinculado al `phone_number_id` de tu desarrollo (ej. FUEGO), escribe al bot.
2. Sigue el flujo: responde que quieres comprar/invertir, acepta visita o llamada, y cuando pida el nombre escribe uno de al menos 3 letras (ej. "Juan").
3. El backend crea el lead en Zoho CRM, el canal en Cliq y el mensaje inicial en el canal.
4. Donde ver:
   - **Zoho CRM:** nuevo lead con telefono, nombre, Lead_Source WhatsApp.
   - **Zoho Cliq:** nuevo canal tipo "WA | FUEGO | Juan | +52...", con el mensaje inicial del lead.

### 2. WA hacia Cliq (mensajes del cliente)

1. Con el mismo chat de WhatsApp (ya calificado), envia otro mensaje (ej. "Hola, cuando me contactan?").
2. Donde ver: en el **canal de Cliq** de ese lead debe aparecer un mensaje con prefijo `[WA-IN]`, nombre, telefono y el texto.

### 3. Cliq hacia WA (respuesta del asesor)

1. En Cliq, configura el **Channel Outgoing Webhook** del canal (o uno global) apuntando a:
   `https://TU_DOMINIO/api/webhooks/cliq`
   (reemplaza TU_DOMINIO por tu dominio de producción, ej. `tu-app.vercel.app`).
2. Escribe un mensaje en ese canal (como usuario, no como bot).
3. Donde ver: en **WhatsApp** le debe llegar ese mensaje al numero del cliente.

### 4. Probar solo el Incoming Webhook (sin pasar por WhatsApp)

Desde tu maquina, con la URL del bot y un canal que ya exista (necesitas el `channel_unique_name` del canal):

```bash
curl -X POST "TU_CLIQ_BOT_INCOMING_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{\"channel_id\":\"T123\",\"channel_unique_name\":\"NOMBRE_UNICO_DEL_CANAL\",\"development\":\"FUEGO\",\"user_phone\":\"+521234567890\",\"user_name\":\"Prueba\",\"text\":\"Mensaje de prueba\",\"crm_lead_url\":\"\"}"
```

Si el mensaje aparece en ese canal con formato `[WA-IN] Prueba (+521234567890)...`, el handler y la URL estan bien.
