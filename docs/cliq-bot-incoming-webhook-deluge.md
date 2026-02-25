# WA|BOT — Incoming Webhook Handler (pegar en Cliq)

En Zoho Cliq: **Bots** → bot **WA|BOT** → **Incoming Webhook Handler** → borra todo lo que haya y pega exactamente el siguiente código.

---

## Donde conseguir las variables

### CLIQ_BOT_INCOMING_WEBHOOK_URL

La URL la da **Zoho Cliq** cuando configuras el bot:

1. Entra a **Zoho Cliq** (cliq.zoho.com).
2. Menu o engranaje → **Bots** → **Add Bot** (o edita el bot, ej. **WA|BOT**).
3. Activa **Incoming Webhook Handler** (o **Incoming Webhook**).
4. Para **WA|BOT** la URL es **Incoming Webhook Endpoint:** `https://cliq.zoho.com/api/v2/bots/wabot/incoming` (el unique name del bot es `wabot`).
5. En tu `.env` (o en Vercel) pon:  
   `CLIQ_BOT_INCOMING_WEBHOOK_URL=https://cliq.zoho.com/api/v2/bots/wabot/incoming`

Si no ves la URL, suele estar en la misma pantalla del Incoming Webhook del bot, a veces como “Webhook URL” o “Endpoint URL”.

### CLIQ_BOT_INCOMING_WEBHOOK_TOKEN (obligatorio para que Cliq acepte el POST; sin esto da 401)

Cliq exige un **Webhook Token** en la URL para autenticar las llamadas al Incoming Webhook. Sin este token, la API de Cliq responde **401 Unauthorized**.

**Donde se saca el token (paso a paso):**

1. Entra a **Zoho Cliq** en el navegador: [cliq.zoho.com](https://cliq.zoho.com).
2. Abre el **menu** (icono de hamburguesa o tu foto/avatar arriba) y entra a **Bots & Tools** (o "Bots y herramientas").
3. En el listado de herramientas internas, busca **Webhook Tokens** (o "Tokens de webhook") y haz clic.
4. Cliq puede pedir **verificación 2FA** (código por app o SMS). Completa la verificación y pulsa **Continue**.
5. Dentro de Webhook Tokens, haz clic en **Generate New Token** (o "Generar nuevo token").
6. Escribe un nombre para el token (ej. `WA Bridge`) y confirma. Cliq mostrará el **token** (una cadena larga).
7. **Copia el token de inmediato**: solo se muestra una vez. Si no lo copias, tendrás que generar otro token nuevo.
8. Pega ese valor en tu `.env` o en **Vercel** → Settings → Environment Variables:
   - Nombre: `CLIQ_BOT_INCOMING_WEBHOOK_TOKEN`
   - Valor: el token que copiaste (sin espacios ni comillas).

**Importante:** Este token **no** está en la pantalla del bot (donde ves la URL del Incoming Webhook). Es una sección distinta: **Bots & Tools → Webhook Tokens**. Puedes tener hasta 5 tokens; si ya tienes uno, puedes reutilizarlo o crear uno nuevo solo para este bridge.

Documentación oficial: [Webhook Tokens en Cliq](https://www.zoho.com/cliq/help/platform/webhook-tokens.html).

### CLIQ_BRIDGE_SECRET

**No se obtiene de ningun lado:** tu eliges una frase o string secreto (ej. una contraseña larga) y la usas en dos sitios:

1. **En tu `.env`:**  
   `CLIQ_BRIDGE_SECRET=la_frase_secreta_que_elijas`
2. **En el script Deluge** (abajo), en la primera linea:  
   `bridge_secret = "la_frase_secreta_que_elijas";`  
   (la misma frase que en el .env)

Si dejas `bridge_secret = "";` en el script y no defines `CLIQ_BRIDGE_SECRET` en el .env, el bot acepta todas las llamadas (sirve para probar; en producción conviene usar secreto).

### CLIQ_BOT_UNIQUE_NAME (para que el bot aparezca en el canal)

El nombre visible del bot es **WA|BOT**; en la API de Cliq su **unique name** es `wabot` (aparece en la ruta del webhook: `/api/v2/bots/wabot/incoming`). Para que la app añada el bot al canal recién creado (y así el bot aparezca en el chat y funcione el bridge Cliq → WA), en tu `.env` (o Vercel) pon:

```
CLIQ_BOT_UNIQUE_NAME=wabot
```

Si no configuras `CLIQ_BOT_UNIQUE_NAME`, el canal se crea e invita a los usuarios por email, pero el bot no se añade al canal (no verás al bot en el chat y el bridge Cliq → WA puede no funcionar para ese canal).

### Comprobar que el token de Cliq tiene los scopes correctos

Zoho **no devuelve los scopes** en la respuesta del refresh token, así que hay que comprobarlos de forma indirecta:

1. **Endpoint de diagnóstico (recomendado)**  
   Con la app desplegada, abre en el navegador (o con `curl`):
   ```
   GET https://tu-dominio.vercel.app/api/debug/cliq-token-check
   ```
   - Si `listChannelsStatus === 200`: el token tiene acceso a Cliq (al menos lectura). Si aun así crear canal falla con `operation_failed`, casi seguro falta el scope **ZohoCliq.Channels.CREATE** en el refresh_token.
   - Si `listChannelsStatus === 401` o `403`: el token no tiene permisos Cliq; el refresh_token se generó sin scopes de Cliq.

2. **En Zoho API Console**  
   - Entra a [API Console](https://api-console.zoho.com), abre tu **Client** (el que usas para Cliq).
   - En **Scopes** revisa que esté marcado **ZohoCliq.Channels.CREATE** (y si quieres listar canales, **ZohoCliq.Channels.READ**).
   - Los scopes del *cliente* son los que *puedes* pedir al generar un grant token. El **refresh_token** que tienes guardado solo tiene los scopes que seleccionaste **en el momento** de canjear el grant token por refresh_token. Si entonces no incluiste Cliq, hay que generar un **nuevo** grant token con ZohoCliq.Channels.CREATE marcado y canjearlo por un nuevo refresh_token, y actualizar `ZOHO_CLIQ_REFRESH_TOKEN` (o `ZOHO_REFRESH_TOKEN`) con ese valor.

3. **Regenerar refresh_token con scope Cliq**  
   - En API Console, en tu Client, en Scopes añade **ZohoCliq.Channels.CREATE**.
   - Genera un **Grant Token** (Authorize) con ese scope incluido.
   - Canjea el grant token por **access_token** y **refresh_token** (POST a `/oauth/v2/token` con `grant_type=authorization_code` y el `code`).
   - El nuevo **refresh_token** ya tendrá el scope de Cliq; úsalo en `ZOHO_CLIQ_REFRESH_TOKEN`.

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
2. En tu `.env` **y en Vercel** (Settings → Environment Variables) agrega:
   `CLIQ_BRIDGE_SECRET=una_frase_secreta_que_elijas`
   (la misma frase que en el script). **Si no está en Vercel**, el backend no enviará el token al publicar en Cliq y verás el aviso `CLIQ_BRIDGE_SECRET not set`; el Deluge puede rechazar la llamada si validas el token.
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

Cuando alguien escribe en el canal de Cliq **que no sea el bot**, ese mensaje se reenvía al WhatsApp del cliente. El backend ignora mensajes del bot (por `sender`) y los que contienen `[WA-IN]` para evitar bucles.

**Opción A – Channel Outgoing Webhook (Deluge que llama a nuestra API)**

1. En el canal de Cliq: **Connectors** → **Edit Code** (Outgoing Webhook).
2. El handler recibe `user`, `data`, `operation`. Cuando `operation == "message"` (o el que envíe Cliq), extrae el texto del mensaje y el `channel_id` (o el id del chat).
3. En Deluge, si el remitente no es el bot, llama a nuestra API con `invokeUrl`:
   - URL: `https://TU_DOMINIO/api/webhooks/cliq`
   - Método: POST
   - Body (JSON): `channel_id`, `message` (o `text`), `sender` (id o nombre del usuario, o objeto con `id`/`name`/`type` para que el backend filtre al bot), y `secret` = CLIQ_BRIDGE_SECRET.

**Opción B – Bot Participation Handler que llama a nuestra API**

Si usas Participation Handler en el bot, cuando `operation == "message_sent"` y el remitente no es el bot, en Deluge haz `invokeUrl` a `https://TU_DOMINIO/api/webhooks/cliq` con el mismo body (channel_id desde `chat.id`, mensaje desde `data.message.text`, sender desde `user`).

**Comportamiento del backend**

- Solo reenvía a WA si el mensaje **no** es del bot (detecta por `sender.id` tipo `b-`, `sender.type == "bot"`, o nombre/id del bot según `CLIQ_BOT_UNIQUE_NAME`).
- Ignora mensajes que contienen `[WA-IN]`.
- Acepta payload plano (`channel_id`, `message` o `text`, `sender`) o anidado (`chat.id`, `data.message.text`, `user`).

4. Escribe en el canal como **usuario** (no como bot): ese mensaje debe llegar al WhatsApp del cliente.

#### Código Deluge para Cliq -> WA (Participation Handler)

Para que los mensajes que escribe el asesor en el canal se envíen a WhatsApp, el **bot** debe tener configurado el **Participation Handler**. Cuando alguien (que no sea el bot) escribe en el canal, Cliq ejecuta este código; el código debe llamar a nuestra API.

1. En Cliq: **Bots** → bot **WA|BOT** → **Participation Handler** → **Edit Code**.
2. Pega el siguiente código. La URL ya apunta a `https://agente-capital.vercel.app/api/webhooks/cliq`. Si dejas `bridge_secret` vacío, el backend acepta la llamada igual (solo para pruebas; en producción conviene definir `CLIQ_BRIDGE_SECRET` en Vercel y poner aquí el mismo valor).

```javascript
// Cliq -> WA: cuando un usuario escribe en el canal, enviar ese mensaje a WhatsApp
// En Creator, puedes probar así inicializando request vacío. En Cliq, sustituye este bloque por el de más abajo.
request = Map();
request.put("operation", "message_sent");
request.put("data", Map());
request.put("user", Map());
request.put("chat", Map());

// Inicializa el response
response = Map();

// Intenta obtener datos evitando errores por nulos
operation = ifnull(request.get("operation"), "");
data_map = ifnull(request.get("data"), Map());
user_map = ifnull(request.get("user"), Map());
chat_map = ifnull(request.get("chat"), Map());

if (operation != "message_sent") {
    return response;
}

// Validar que user y chat tengan datos
if (user_map.isEmpty() || chat_map.isEmpty()) {
    return response;
}

// Ignora mensajes de bots (id inicia con 'b-' o type=='bot')
sender_id = ifnull(user_map.get("id"), "");
sender_type = ifnull(user_map.get("type"), "");
if (sender_id.toString().startsWith("b-") || sender_type == "bot") {
    return response;
}

// Extrae el mensaje de la estructura esperada
msg = data_map.get("message");
message_text = "";

if (msg != null) {
    text_obj = msg.get("text");
    if (text_obj != null) {
        message_text = text_obj.toString().trim();
    }
}

// Si no hay texto, salir
if (message_text == null || message_text.length() == 0) {
    return response;
}

// Ignorar mensajes que vienen de WhatsApp (ciclo infinito)
if (message_text.indexOf("[WA-IN]") >= 0) {
    return response;
}

// Extrae id del canal
channel_id = chat_map.get("id");
if (channel_id == null || channel_id.toString().length() == 0) {
    return response;
}

// Construir el payload
payload = Map();
payload.put("channel_id", channel_id);
payload.put("message", message_text);
payload.put("sender", user_map);
bridge_secret = ""; // Pon aquí tu secreto si usas CLIQ_BRIDGE_SECRET en el backend
payload.put("secret", bridge_secret);

// Llama a la API vía invokeurl
api_url = "https://agente-capital.vercel.app/api/webhooks/cliq";
invokeurl
[
    url : api_url
    type : POST
    parameters : payload
    content-type : application/json
];

return response;
```

**Bloque para Cliq (solo las 5 líneas):**  
  channel_id = chat_map.get("id");
  if (channel_id != null) {
    api_url = "https://agente-capital.vercel.app/api/webhooks/cliq";
    bridge_secret = "";

    payload = Map();
    payload.put("channel_id", channel_id);
    payload.put("message", message_text);
    payload.put("sender", user_map);
    payload.put("secret", bridge_secret);

    invokeurl
    [
      url: api_url
      type: POST
      parameters: payload
      content-type: application/json
    ];
  }
}
return response;
```

**Bloque para Cliq (solo las 5 líneas):** cuando pegues este código en el **Participation Handler dentro de Cliq** (no en Creator), sustituye las 5 líneas que empiezan por `request = Map();` por estas otras, para usar los datos reales que Cliq inyecta (operation, data, user, chat):

```javascript
request = Map();
request.put("operation", operation);
request.put("data", data);
request.put("user", user);
request.put("chat", chat);
```

Así en el editor (Creator) el script compila con el bloque por defecto; en Cliq usas el bloque de arriba y el handler recibe los datos reales.

3. Opcional: si más adelante configuras `CLIQ_BRIDGE_SECRET` en Vercel, cambia `bridge_secret = "";` por `bridge_secret = "tu_secreto";` (el mismo valor que en Vercel).
4. Guarda el handler. Asegúrate de que el bot tiene **Listen to messages** activado en la configuración de participación.

Si en tu entorno Deluge el body se envía con otro parámetro (por ejemplo `requestBody` en lugar de `parameters`), ajusta la tarea `invokeurl` según la documentación de tu producto (Cliq/CRM).

### 4. Probar solo el Incoming Webhook (sin pasar por WhatsApp)

Desde tu maquina, con la URL del bot y un canal que ya exista (necesitas el `channel_unique_name` del canal):

```bash
curl -X POST "TU_CLIQ_BOT_INCOMING_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{\"channel_id\":\"T123\",\"channel_unique_name\":\"NOMBRE_UNICO_DEL_CANAL\",\"development\":\"FUEGO\",\"user_phone\":\"+521234567890\",\"user_name\":\"Prueba\",\"text\":\"Mensaje de prueba\",\"crm_lead_url\":\"\"}"
```

Si el mensaje aparece en ese canal con formato `[WA-IN] Prueba (+521234567890)...`, el handler y la URL estan bien.
