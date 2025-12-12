# Configuración de ZOHO CRM

Esta guía explica cómo configurar la integración con ZOHO CRM para que funcione en producción.

## ⚠️ Importante

**La integración con ZOHO CRM NO funciona en local** debido a las limitaciones de autenticación de ZOHO. Solo funcionará cuando la aplicación esté desplegada en producción.

**💡 No necesitas crear ninguna ruta `/oauth/callback` en tu aplicación**: Para obtener el Refresh Token, puedes usar `https://accounts.zoho.com/oauth/v2/auth` como redirect URI, que es el que Zoho acepta por defecto. Una vez que tengas el Refresh Token, tu aplicación usará ese token directamente sin necesidad de un callback.

## 📋 Requisitos Previos

1. Una cuenta de ZOHO CRM activa
2. Acceso a la consola de desarrolladores de ZOHO
3. Un dominio en producción donde esté desplegada la aplicación

## 🔧 Pasos para Configurar

### 1. Crear una Aplicación en ZOHO

1. Ve a [ZOHO API Console](https://api-console.zoho.com/)
2. Inicia sesión con tu cuenta de ZOHO
3. Haz clic en "Add Client"
4. Selecciona "Server-based Applications"
5. Completa el formulario:
   - **Client Name**: Nombre de tu aplicación (ej: "Capital Plus AI Agent")
   - **Homepage URL**: URL de tu aplicación en producción (ej: `https://agente-capital.vercel.app`)
   - **Authorized Redirect URIs**: 
     - `https://accounts.zoho.com/oauth/v2/auth` ⭐ **USA ESTE** (no necesitas crear ninguna ruta en tu app)
     - (Opcional) `https://agente-capital.vercel.app/oauth/callback` (solo si planeas crear esa ruta después)
   - **Scopes**: Selecciona los siguientes:
     - `ZohoCRM.modules.ALL`
     - `ZohoCRM.settings.ALL`
     - `ZohoCRM.users.READ`
6. Haz clic en "Create"
7. **Guarda el Client ID y Client Secret** que se generan

**💡 Nota importante**: Para obtener el Refresh Token, NO necesitas que la ruta `/oauth/callback` exista en tu aplicación. Puedes usar `https://accounts.zoho.com/oauth/v2/auth` como redirect URI, que es el que Zoho usa para su propio playground.

### 2. Generar Refresh Token

El Refresh Token es necesario para que la aplicación pueda obtener tokens de acceso automáticamente.

**⚠️ IMPORTANTE**: El `redirect_uri` que uses en la URL de autorización DEBE ser EXACTAMENTE igual al que configuraste en el paso 1 (incluyendo http/https, con o sin barra final, etc.).

#### Opción A: Usando Zoho OAuth Playground (RECOMENDADO - Más Fácil)

Esta es la forma más sencilla y evita problemas con los redirect URIs:

1. Ve a [Zoho OAuth Playground](https://accounts.zoho.com/developerconsole)
2. Inicia sesión con tu cuenta de Zoho
3. Selecciona tu aplicación (la que creaste en el paso 1)
4. En "Scopes", selecciona:
   - `ZohoCRM.modules.ALL`
   - `ZohoCRM.settings.ALL`
   - `ZohoCRM.users.READ`
5. Haz clic en "Generate Code"
6. Autoriza la aplicación
7. Copia el código que aparece
8. Haz clic en "Generate Access Token"
9. En la respuesta, encontrarás `refresh_token`. **Guarda este valor** (es muy importante, no lo pierdas)

#### Opción B: Usando la URL de autorización manual

**⚠️ IMPORTANTE**: Para obtener el Refresh Token, NO necesitas crear ninguna ruta en tu aplicación. Usa `https://accounts.zoho.com/oauth/v2/auth` como redirect URI, que es el que Zoho acepta por defecto.

**Paso 1: Configurar el Redirect URI en Zoho**

1. Ve a [ZOHO API Console](https://api-console.zoho.com/)
2. Selecciona tu aplicación
3. Ve a la sección "Client Details" o "Authorized Redirect URIs"
4. Asegúrate de que tengas configurado: `https://accounts.zoho.com/oauth/v2/auth`
   - Si no lo tienes, agrégalo y guarda los cambios
   - **Este es el redirect URI que usarás** (no necesitas crear ninguna ruta en tu app)

**Paso 2: Construir la URL de autorización**

Construye la siguiente URL reemplazando:
- `YOUR_CLIENT_ID` con tu Client ID
- `TU_REDIRECT_URI` con el Redirect URI EXACTO que copiaste en el paso anterior

```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=TU_REDIRECT_URI
```

**Ejemplo (usa este, reemplaza `YOUR_CLIENT_ID` con tu Client ID real):**
```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=https://accounts.zoho.com/oauth/v2/auth
```

**Ejemplo real:**
```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ&client_id=1000.ABC123XYZ&response_type=code&access_type=offline&redirect_uri=https://accounts.zoho.com/oauth/v2/auth
```

**Paso 3: Obtener el código de autorización**

1. Abre la URL construida en tu navegador
2. Autoriza la aplicación
3. Serás redirigido a `https://accounts.zoho.com/oauth/v2/auth?code=1000.abc123def456...` (una página de Zoho)
4. **Copia el código completo** que aparece en el parámetro `code` de la URL (ej: `1000.abc123def456...`)
   - El código será algo como: `1000.abc123def456ghi789...`
   - Cópialo completo, es largo

**Paso 4: Intercambiar el código por el Refresh Token**

Usa el código para obtener el Refresh Token ejecutando este comando (reemplaza los valores):

```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=TU_REDIRECT_URI" \
  -d "code=EL_CODIGO_QUE_OBTUVISTE"
```

**⚠️ IMPORTANTE**: El `redirect_uri` en este comando DEBE ser EXACTAMENTE el mismo que usaste en la URL de autorización.

**Ejemplo completo (reemplaza los valores con los tuyos):**
```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=TU_CLIENT_ID" \
  -d "client_secret=TU_CLIENT_SECRET" \
  -d "redirect_uri=https://accounts.zoho.com/oauth/v2/auth" \
  -d "code=EL_CODIGO_QUE_COPIASTE"
```

**Ejemplo real:**
```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=1000.ABC123XYZ" \
  -d "client_secret=abc123def456secret" \
  -d "redirect_uri=https://accounts.zoho.com/oauth/v2/auth" \
  -d "code=1000.abc123def456ghi789jkl012"
```

5. En la respuesta JSON, encontrarás `refresh_token`. **Guarda este valor** (es muy importante).

**Respuesta de ejemplo:**
```json
{
  "access_token": "1000.abc123...",
  "refresh_token": "1000.xyz789...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### 3. Configurar Variables de Entorno en Producción

Agrega las siguientes variables de entorno en tu servidor de producción (o plataforma de hosting):

```env
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_CRM_API_URL=https://www.zohoapis.com/crm/v2
ZOHO_CLIENT_ID=tu-client-id-aqui
ZOHO_CLIENT_SECRET=tu-client-secret-aqui
ZOHO_REFRESH_TOKEN=tu-refresh-token-aqui
ZOHO_REDIRECT_URI=https://tu-dominio.com/oauth/callback
```

**Nota**: Si estás usando ZOHO CRM en una región diferente (EU, IN, AU, etc.), ajusta las URLs:
- EU: `https://accounts.zoho.eu` y `https://www.zohoapis.eu/crm/v2`
- IN: `https://accounts.zoho.in` y `https://www.zohoapis.in/crm/v2`
- AU: `https://accounts.zoho.com.au` y `https://www.zohoapis.com.au/crm/v2`

### 4. Verificar la Configuración

Una vez configurado, puedes verificar que todo funciona:

1. Inicia sesión en la aplicación con un usuario que tenga rol `admin`, `ceo` o `sales_manager`
2. Ve a la sección "ZOHO CRM" en el menú lateral
3. Deberías ver las estadísticas, leads, deals y pipelines de tu cuenta de ZOHO CRM

## 🔐 Permisos y Roles

Solo los siguientes roles pueden acceder a ZOHO CRM:
- **admin**: Administradores del sistema
- **ceo**: CEO de la empresa
- **sales_manager**: Gerentes de ventas

Los usuarios con otros roles verán un mensaje de "Acceso Denegado" si intentan acceder.

## 📊 Funcionalidades Disponibles

La integración permite:

1. **Estadísticas Generales**:
   - Total de leads
   - Total de deals
   - Valor total de deals
   - Valor promedio por deal
   - Distribución de leads por estado
   - Distribución de deals por etapa

2. **Visualización de Leads**:
   - Lista de leads con información básica
   - Filtrado por estado
   - Información de contacto

3. **Visualización de Deals**:
   - Lista de deals con montos
   - Etapas del pipeline
   - Probabilidades de cierre
   - Fechas de cierre

4. **Pipelines**:
   - Visualización de todos los pipelines configurados
   - Etapas de cada pipeline
   - Probabilidades por etapa

## 🐛 Solución de Problemas

### Error: "URI de redireccionamiento no válido" o "El URI de redireccionamiento proporcionado no coincide con el URI configurado"

**Causa**: El `redirect_uri` que estás usando en la URL de autorización no coincide exactamente con el que configuraste en Zoho API Console.

**Solución paso a paso**:

1. **Verifica el Redirect URI configurado en Zoho**:
   - Ve a [ZOHO API Console](https://api-console.zoho.com/)
   - Selecciona tu aplicación
   - Busca la sección "Authorized Redirect URIs" o "Client Details"
   - **Copia EXACTAMENTE** el URI que aparece ahí (incluyendo http/https, con o sin barra final `/`, etc.)

2. **Usa EXACTAMENTE el mismo URI**:
   - En la URL de autorización, usa el URI exacto que copiaste
   - En el comando curl para obtener el token, usa el mismo URI exacto
   - **No agregues ni quites caracteres** (por ejemplo, si termina en `/`, inclúyelo; si no termina, no lo agregues)

3. **Ejemplos comunes de errores**:
   - ❌ Configurado: `https://accounts.zoho.com/oauth/v2/auth` pero usas: `https://accounts.zoho.com/oauth/v2/auth/` (barra final extra)
   - ❌ Configurado: `https://tu-dominio.com/oauth/callback` pero usas: `http://tu-dominio.com/oauth/callback` (http vs https)
   - ❌ Configurado: `https://tu-dominio.com/oauth/callback` pero usas: `https://www.tu-dominio.com/oauth/callback` (www vs sin www)

4. **Solución rápida**: Si sigues teniendo problemas, usa la **Opción A (OAuth Playground)** del paso 2, que evita estos problemas automáticamente.

### Error: "ZOHO_REFRESH_TOKEN no está configurado"

**Solución**: Verifica que todas las variables de entorno estén configuradas correctamente en producción.

### Error: "Error obteniendo token de ZOHO"

**Solución**: 
- Verifica que el Client ID y Client Secret sean correctos
- Asegúrate de que el Refresh Token no haya expirado (puedes generar uno nuevo)
- Verifica que las URLs de ZOHO correspondan a tu región
- Verifica que el `redirect_uri` en el comando curl sea exactamente el mismo que configuraste

### Error: "No tienes permisos para acceder a ZOHO CRM"

**Solución**: Asegúrate de que el usuario tenga uno de los roles permitidos: `admin`, `ceo` o `sales_manager`.

### No se muestran datos

**Solución**:
- Verifica que tu cuenta de ZOHO CRM tenga leads y deals
- Revisa los logs del servidor para ver errores específicos
- Asegúrate de que los scopes estén correctamente configurados

## 📚 Recursos Adicionales

- [Documentación de ZOHO CRM API](https://www.zoho.com/crm/developer/docs/api/v2/)
- [ZOHO OAuth 2.0 Guide](https://www.zoho.com/crm/developer/docs/api/v2/oauth-overview.html)
- [ZOHO API Console](https://api-console.zoho.com/)

## 🔄 Actualización de Tokens

Los tokens de acceso se renuevan automáticamente usando el Refresh Token. Sin embargo, si el Refresh Token expira o se revoca, necesitarás generar uno nuevo siguiendo los pasos del punto 2.

