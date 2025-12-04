# 🔧 Configuración de Variables de Entorno en Vercel

Esta guía te ayudará a configurar correctamente las variables de entorno en Vercel para que tu aplicación se conecte a Supabase.

## 🚨 Problema Común: Error ENOTFOUND

Si ves este error en producción:
```
Error: getaddrinfo ENOTFOUND db.xxxxx.supabase.co
```

Significa que la aplicación no puede resolver el hostname de Supabase. Esto generalmente se debe a que la variable `DATABASE_URL` no está configurada correctamente en Vercel.

---

## ✅ Solución: Configurar DATABASE_URL en Vercel

### Paso 1: Obtener tu Connection String de Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com/)
2. Ve a **Settings** → **Database**
3. Busca la sección **Connection string**
4. Selecciona **URI** (no "Connection pooling")
5. Copia la URL que se ve así:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
6. **Reemplaza `[YOUR-PASSWORD]`** con tu contraseña real de la base de datos

### Paso 2: Configurar en Vercel

1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecciona tu proyecto
3. Ve a **Settings** → **Environment Variables**
4. Agrega una nueva variable:

   **Nombre:** `DATABASE_URL`
   
   **Valor:** La URL completa que copiaste de Supabase
   ```
   postgresql://postgres:TU_PASSWORD_REAL@db.xxxxx.supabase.co:5432/postgres
   ```
   
   ⚠️ **IMPORTANTE:** 
   - Reemplaza `TU_PASSWORD_REAL` con tu contraseña real
   - No uses `[YOUR-PASSWORD]` literalmente
   - La URL debe comenzar con `postgresql://` o `postgres://`

5. Selecciona los **Environments** donde aplicará:
   - ✅ Production
   - ✅ Preview (opcional)
   - ✅ Development (opcional)

6. Haz clic en **Save**

### Paso 3: Redesplegar

Después de agregar la variable de entorno, necesitas redesplegar:

1. Ve a **Deployments**
2. Haz clic en los **3 puntos** (⋯) del deployment más reciente
3. Selecciona **Redeploy**
4. O simplemente haz un nuevo commit y push a tu repositorio

---

## 🔍 Verificar la Configuración

### Opción 1: Verificar en los Logs de Vercel

Después de redesplegar, ve a **Deployments** → Selecciona el deployment → **Logs**

Deberías ver algo como:
```
🔌 Configurando conexión a: db.xxxxx.supabase.co:5432
```

Si ves un error `ENOTFOUND`, significa que la variable no está configurada correctamente.

### Opción 2: Verificar desde el Código (Temporal)

Puedes agregar temporalmente este código en cualquier API route para verificar:

```typescript
// Solo para debugging - ELIMINAR después
console.log('DATABASE_URL configurada:', process.env.DATABASE_URL ? 'Sí' : 'No');
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  console.log('Hostname:', url.hostname);
  console.log('Port:', url.port || 5432);
}
```

**⚠️ IMPORTANTE:** Elimina este código después de verificar, ya que puede exponer información sensible en los logs.

---

## 📋 Variables de Entorno Completas para Vercel

Aquí está la lista completa de variables que necesitas configurar en Vercel:

### Variables Requeridas

```bash
# Base de datos (REQUERIDO)
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres

# Pinecone (REQUERIDO)
PINECONE_API_KEY=tu-pinecone-api-key
PINECONE_INDEX_NAME=capitalplus-rag

# HuggingFace (REQUERIDO para embeddings)
HUGGINGFACE_API_KEY=tu-huggingface-api-key

# OpenAI (Opcional - solo si usas OpenAI en lugar de LM Studio)
OPENAI_API_KEY=tu-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

### Variables Opcionales

```bash
# Zoho CRM (Solo si usas la integración)
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_CRM_API_URL=https://www.zohoapis.com/crm/v2
ZOHO_CLIENT_ID=tu-client-id
ZOHO_CLIENT_SECRET=tu-client-secret
ZOHO_REFRESH_TOKEN=tu-refresh-token
ZOHO_REDIRECT_URI=https://tu-dominio.com/oauth/callback

# Configuración de la aplicación
NODE_ENV=production
UPLOAD_DIR=./tmp
MAX_FILE_SIZE=52428800
CHUNK_SIZE=500
CHUNK_OVERLAP=50
```

---

## 🚫 Errores Comunes y Soluciones

### Error: "ENOTFOUND db.xxxxx.supabase.co"

**Causa:** La variable `DATABASE_URL` no está configurada o está mal formada.

**Solución:**
1. Verifica que `DATABASE_URL` esté en **Settings** → **Environment Variables**
2. Verifica que el formato sea correcto: `postgresql://user:password@host:port/database`
3. Asegúrate de haber reemplazado `[YOUR-PASSWORD]` con tu contraseña real
4. Redesplega la aplicación después de agregar la variable

### Error: "password authentication failed"

**Causa:** La contraseña en `DATABASE_URL` es incorrecta.

**Solución:**
1. Verifica tu contraseña en Supabase Dashboard → Settings → Database
2. Si no la recuerdas, puedes resetearla en Supabase
3. Actualiza `DATABASE_URL` en Vercel con la contraseña correcta
4. Redesplega

### Error: "connection refused" o "ECONNREFUSED"

**Causa:** La base de datos no está accesible desde Vercel (posible firewall o IP bloqueada).

**Solución:**
1. En Supabase Dashboard → Settings → Database → Connection Pooling
2. Verifica que **Allow connections from any IP** esté habilitado
3. O agrega las IPs de Vercel a la whitelist (si usas IP restrictions)

### La aplicación funciona en local pero no en producción

**Causa:** Las variables de entorno están configuradas en tu `.env` local pero no en Vercel.

**Solución:**
1. Verifica que todas las variables de `.env` estén también en Vercel
2. Recuerda que Vercel no lee tu archivo `.env` - debes configurarlas manualmente
3. Usa el dashboard de Vercel para agregar cada variable

---

## 🔐 Seguridad

### ⚠️ Nunca hagas esto:

- ❌ No subas tu archivo `.env` al repositorio
- ❌ No compartas tus `DATABASE_URL` en logs públicos
- ❌ No uses la misma contraseña en desarrollo y producción
- ❌ No expongas tus API keys en el código

### ✅ Mejores prácticas:

- ✅ Usa diferentes bases de datos para desarrollo y producción
- ✅ Rota tus contraseñas regularmente
- ✅ Usa Connection Pooling de Supabase para mejor rendimiento
- ✅ Revisa los logs regularmente para detectar problemas

---

## 📚 Recursos Adicionales

- [Documentación de Vercel sobre Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Documentación de Supabase sobre Connection Strings](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Guía de Deployment completa](./DEPLOYMENT.md)

---

## 🆘 ¿Necesitas Ayuda?

Si después de seguir estos pasos sigues teniendo problemas:

1. Revisa los logs de Vercel para ver el error exacto
2. Verifica que todas las variables estén configuradas
3. Asegúrate de haber redesplegado después de agregar las variables
4. Verifica que tu base de datos de Supabase esté activa y accesible

---

**Capital Plus** © 2024 - Vercel Environment Setup Guide

