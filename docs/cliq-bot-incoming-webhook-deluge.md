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
