# Configuración de ZOHO CRM

Esta guía explica cómo configurar la integración con ZOHO CRM para que funcione en producción.

## ⚠️ Importante

**La integración con ZOHO CRM NO funciona en local** debido a las limitaciones de autenticación de ZOHO. Solo funcionará cuando la aplicación esté desplegada en producción.

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
   - **Homepage URL**: URL de tu aplicación en producción (ej: `https://tu-dominio.com`)
   - **Authorized Redirect URIs**: 
     - `https://tu-dominio.com/oauth/callback`
     - `https://accounts.zoho.com/oauth/v2/auth`
   - **Scopes**: Selecciona los siguientes:
     - `ZohoCRM.modules.ALL`
     - `ZohoCRM.settings.ALL`
     - `ZohoCRM.users.READ`
6. Haz clic en "Create"
7. **Guarda el Client ID y Client Secret** que se generan

### 2. Generar Refresh Token

El Refresh Token es necesario para que la aplicación pueda obtener tokens de acceso automáticamente.

#### Opción A: Usando la URL de autorización

1. Construye la siguiente URL (reemplaza `YOUR_CLIENT_ID` con tu Client ID):
```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=https://accounts.zoho.com/oauth/v2/auth
```

2. Abre la URL en tu navegador
3. Autoriza la aplicación
4. Serás redirigido a una URL con un código en el parámetro `code`
5. Copia ese código

6. Usa el código para obtener el Refresh Token ejecutando este comando (reemplaza los valores):
```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://accounts.zoho.com/oauth/v2/auth" \
  -d "code=EL_CODIGO_QUE_OBTUVISTE"
```

7. En la respuesta, encontrarás `refresh_token`. **Guarda este valor**.

#### Opción B: Usando herramientas online

Puedes usar herramientas como [ZOHO OAuth Playground](https://accounts.zoho.com/developerconsole) para generar el refresh token más fácilmente.

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

### Error: "ZOHO_REFRESH_TOKEN no está configurado"

**Solución**: Verifica que todas las variables de entorno estén configuradas correctamente en producción.

### Error: "Error obteniendo token de ZOHO"

**Solución**: 
- Verifica que el Client ID y Client Secret sean correctos
- Asegúrate de que el Refresh Token no haya expirado (puedes generar uno nuevo)
- Verifica que las URLs de ZOHO correspondan a tu región

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

