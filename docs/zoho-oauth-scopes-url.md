# URL de autorización OAuth Zoho (Cliq + CRM + Meeting)

Documento de referencia para generar una **URL de autorización** que incluya todos los scopes necesarios para el proyecto: **Zoho Cliq** (canales, incluyendo delete), **Zoho CRM** (leads, notas, etc.) y **Zoho Meeting** (crear reuniones desde la API).

En Zoho los scopes se separan con **comas** (no espacios).

---

## Scopes incluidos

### Zoho Cliq (canales)
| Scope | Uso en el proyecto |
|-------|---------------------|
| `ZohoCliq.Channels.CREATE` | Crear canal por lead (handleClientAccepta). |
| `ZohoCliq.Channels.READ` | Listar/obtener canales. |
| `ZohoCliq.Channels.UPDATE` | Asociar bot al canal (addBotToCliqChannel). |
| `ZohoCliq.Channels.DELETE` | Eliminar canales desde la API (p. ej. al cerrar lead). |

### Zoho CRM
| Scope | Uso en el proyecto |
|-------|---------------------|
| `ZohoCRM.modules.leads.ALL` | Crear leads, buscar por teléfono, GET lead por ID. |
| `ZohoCRM.modules.notes.READ` | Leer notas de leads (notes-insights, etc.). |
| `ZohoCRM.settings.READ` | Metadatos, layouts, campos (opcional). |
| `ZohoCRM.users.READ` | Datos de propietario (Owner) del lead. |

Si ya usas un scope más amplio (p. ej. `ZohoCRM.modules.ALL`), puedes sustituir los cuatro anteriores por ese en la URL.

### Zoho Meeting (crear reuniones)
| Scope | Uso |
|-------|-----|
| `ZohoMeeting.meeting.CREATE` | Crear sesiones/reuniones desde la API. |
| `ZohoMeeting.manageOrg.READ` | Obtener organización y usuarios (presenter, etc.). |

---

## URL de autorización (plantilla)

Sustituye `TU_CLIENT_ID` y `TU_REDIRECT_URI` por los valores de tu cliente en [api-console.zoho.com](https://api-console.zoho.com). La `redirect_uri` debe estar registrada exactamente igual en la consola.

**Región US (accounts.zoho.com):**

```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCliq.Channels.CREATE,ZohoCliq.Channels.READ,ZohoCliq.Channels.UPDATE,ZohoCliq.Channels.DELETE,ZohoCRM.modules.leads.ALL,ZohoCRM.modules.notes.READ,ZohoCRM.settings.READ,ZohoCRM.users.READ,ZohoMeeting.meeting.CREATE,ZohoMeeting.manageOrg.READ&client_id=TU_CLIENT_ID&response_type=code&redirect_uri=TU_REDIRECT_URI&access_type=offline&prompt=consent
```

**Misma URL en una sola línea (para copiar):**

```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCliq.Channels.CREATE,ZohoCliq.Channels.READ,ZohoCliq.Channels.UPDATE,ZohoCliq.Channels.DELETE,ZohoCRM.modules.leads.ALL,ZohoCRM.modules.notes.READ,ZohoCRM.settings.READ,ZohoCRM.users.READ,ZohoMeeting.meeting.CREATE,ZohoMeeting.manageOrg.READ&client_id=TU_CLIENT_ID&response_type=code&redirect_uri=TU_REDIRECT_URI&access_type=offline&prompt=consent
```

**Si prefieres CRM con acceso completo a módulos** (en lugar de leads + notes + settings + users por separado):

```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCliq.Channels.CREATE,ZohoCliq.Channels.READ,ZohoCliq.Channels.UPDATE,ZohoCliq.Channels.DELETE,ZohoCRM.modules.ALL,ZohoCRM.settings.READ,ZohoCRM.users.READ,ZohoMeeting.meeting.CREATE,ZohoMeeting.manageOrg.READ&client_id=TU_CLIENT_ID&response_type=code&redirect_uri=TU_REDIRECT_URI&access_type=offline&prompt=consent
```

---

## Otras regiones

Cambia solo el dominio de `accounts`:

| Región | Dominio |
|--------|---------|
| US     | `https://accounts.zoho.com` |
| EU     | `https://accounts.zoho.eu` |
| India  | `https://accounts.zoho.in` |
| Australia | `https://accounts.zoho.com.au` |

Ejemplo EU (mismos scopes):

```
https://accounts.zoho.eu/oauth/v2/auth?scope=ZohoCliq.Channels.CREATE,ZohoCliq.Channels.READ,ZohoCliq.Channels.UPDATE,ZohoCliq.Channels.DELETE,ZohoCRM.modules.leads.ALL,ZohoCRM.modules.notes.READ,ZohoCRM.settings.READ,ZohoCRM.users.READ,ZohoMeeting.meeting.CREATE,ZohoMeeting.manageOrg.READ&client_id=TU_CLIENT_ID&response_type=code&redirect_uri=TU_REDIRECT_URI&access_type=offline&prompt=consent
```

---

## Redirect URI

- Debe coincidir **exactamente** con la configurada en la API Console (incluyendo `http` vs `https`, barra final, puerto).
- Si tiene caracteres especiales, debe ir **codificada** en la URL (ej. `https%3A%2F%2Ftu-app.com%2Fcallback`).

---

## Después de autorizar

1. Zoho redirige a `redirect_uri?code=...`.
2. Intercambias el `code` por tokens con un POST a `https://accounts.zoho.com/oauth/v2/token` (o la región que uses) con `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri`.
3. Obtienes `refresh_token` y `access_token`. El **refresh_token** es el que debes guardar en `.env`:
   - Para Cliq: `ZOHO_CLIQ_REFRESH_TOKEN` (o `ZOHO_REFRESH_TOKEN` si usas el mismo token para todo).
   - Para CRM: `ZOHO_REFRESH_TOKEN`.
   - Si usas **un solo cliente** para Cliq, CRM y Meeting, un único refresh token con todos los scopes sirve para los tres; en ese caso puedes poner el mismo valor en `ZOHO_REFRESH_TOKEN` y `ZOHO_CLIQ_REFRESH_TOKEN` (según cómo esté leyendo cada servicio el token).

---

## Zoho Meeting API (referencia para implementar)

- Crear reunión: `POST /{zsoid}/sessions.json` (topic, presenter, startTime; opcional: agenda, duration, timezone, participants).
- Documentación: [Zoho Meeting API – Create a Meeting](https://www.zoho.com/meeting/api-integration/meeting-api/create-a-meeting.html).
- El `zsoid` es el Organization ID de Zoho Meeting (puede coincidir con el de CRM o ser distinto según la cuenta).

Cuando implementes la creación de meets desde la API, usarás el mismo token (con `ZohoMeeting.meeting.CREATE` y `ZohoMeeting.manageOrg.READ`) para las llamadas a la API de Meeting.
