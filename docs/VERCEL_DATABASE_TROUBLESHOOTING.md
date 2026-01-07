# Solución de Problemas de Base de Datos en Vercel

Este documento te ayudará a diagnosticar y resolver problemas de conexión a la base de datos que solo ocurren en producción (Vercel) pero funcionan correctamente en local.

## Síntomas Comunes

- Error: `Circuit breaker is OPEN. database query rejected`
- Error: `Tenant or user not found`
- Error: `password authentication failed`
- Error: `authentication failed`
- Las consultas funcionan en local pero fallan en Vercel

## Diagnóstico Rápido

### 1. Verificar Variables de Entorno en Vercel

1. Ve a **Vercel Dashboard** → Tu Proyecto → **Settings** → **Environment Variables**
2. Verifica que existan las siguientes variables (en orden de prioridad):

   **PRIORIDAD 1 (Recomendado):**
   ```
   POSTGRES_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```

   **PRIORIDAD 2 (Alternativa):**
   ```
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

   **PRIORIDAD 3 (No recomendado - límite bajo):**
   ```
   POSTGRES_URL_NON_POOLING=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

### 2. Obtener la Cadena de Conexión Correcta desde Supabase

1. Ve a **Supabase Dashboard** → Tu Proyecto → **Settings** → **Database**
2. En la sección **Connection String**, encontrarás dos opciones:

   **✅ RECOMENDADO: Connection pooling (Transaction mode)**
   - Usa esta para `POSTGRES_URL`
   - Permite hasta 200 conexiones simultáneas
   - Formato: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
   - Puerto: **6543** (pooler)

   **⚠️ NO RECOMENDADO: Direct connection (Session mode)**
   - Solo si no tienes otra opción
   - Límite de 4-10 conexiones según tu plan
   - Formato: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
   - Puerto: **5432** (directo)

### 3. Verificar la Contraseña

El error "Tenant or user not found" o "password authentication failed" generalmente indica:

1. **La contraseña en la URL está incorrecta**
   - Asegúrate de copiar la contraseña completa desde Supabase
   - La contraseña puede contener caracteres especiales que necesitan ser codificados en URL
   - Si la contraseña tiene caracteres especiales, usa URL encoding:
     - `@` → `%40`
     - `#` → `%23`
     - `$` → `%24`
     - `%` → `%25`
     - `&` → `%26`
     - `+` → `%2B`
     - `=` → `%3D`

2. **La contraseña fue cambiada en Supabase pero no actualizada en Vercel**
   - Si cambiaste la contraseña en Supabase, debes actualizarla también en Vercel

### 4. Usar el Endpoint de Health Check

El endpoint `/api/health` te ayudará a diagnosticar el problema:

```bash
# Ver el estado del sistema
GET https://tu-dominio.vercel.app/api/health
```

Esto te mostrará:
- Estado del circuit breaker
- Estado de la conexión a la base de datos
- Variables de entorno configuradas (sin exponer valores sensibles)

### 5. Resetear el Circuit Breaker

Si el circuit breaker está abierto, puedes resetearlo (solo admin/ceo):

```bash
POST https://tu-dominio.vercel.app/api/health/reset-circuit-breaker
Authorization: Bearer <tu-token>
```

## Soluciones Paso a Paso

### Solución 1: Configurar POSTGRES_URL Correctamente

1. **Obtener la cadena de conexión desde Supabase:**
   - Ve a Supabase Dashboard → Settings → Database
   - Copia la cadena de **"Connection pooling" (Transaction mode)**
   - Formato: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`

2. **Configurar en Vercel:**
   - Ve a Vercel Dashboard → Tu Proyecto → Settings → Environment Variables
   - Agrega o actualiza la variable `POSTGRES_URL`
   - Pega la cadena de conexión completa
   - **IMPORTANTE:** Asegúrate de que la contraseña esté correcta

3. **Reiniciar el Deployment:**
   - Ve a Vercel Dashboard → Tu Proyecto → Deployments
   - Haz clic en los tres puntos (...) del último deployment
   - Selecciona **"Redeploy"**

### Solución 2: Verificar Codificación de URL

Si tu contraseña tiene caracteres especiales:

1. **Opción A: Cambiar la contraseña en Supabase**
   - Ve a Supabase Dashboard → Settings → Database
   - Cambia la contraseña a una que no tenga caracteres especiales
   - Actualiza la cadena de conexión en Vercel

2. **Opción B: Codificar la contraseña en la URL**
   - Usa un codificador de URL para codificar la contraseña
   - Ejemplo: Si tu contraseña es `P@ssw0rd#123`, la URL sería:
     ```
     postgresql://postgres.[PROJECT-REF]:P%40ssw0rd%23123@aws-0-[REGION].pooler.supabase.com:6543/postgres
     ```

### Solución 3: Verificar que las Variables Estén en el Entorno Correcto

En Vercel, las variables de entorno pueden estar configuradas para:
- **Production** (producción)
- **Preview** (preview deployments)
- **Development** (desarrollo)

Asegúrate de que `POSTGRES_URL` esté configurada para **Production**:

1. Ve a Vercel Dashboard → Tu Proyecto → Settings → Environment Variables
2. Verifica que `POSTGRES_URL` tenga el checkmark en **Production**
3. Si no lo tiene, edita la variable y marca **Production**

## Verificación

Después de aplicar las soluciones:

1. **Espera 1-2 minutos** para que Vercel reinicie el deployment
2. **Verifica el estado:**
   ```bash
   GET https://tu-dominio.vercel.app/api/health
   ```
3. **Revisa los logs en Vercel:**
   - Ve a Vercel Dashboard → Tu Proyecto → Deployments
   - Haz clic en el último deployment
   - Revisa los logs para ver si hay errores

## Errores Comunes y Soluciones

### Error: "Tenant or user not found"

**Causa:** La contraseña en la cadena de conexión es incorrecta o la cadena está mal formada.

**Solución:**
1. Verifica que la contraseña en `POSTGRES_URL` sea correcta
2. Asegúrate de usar la cadena de "Connection pooling" (Transaction mode)
3. Verifica que no haya espacios extra en la URL
4. Reinicia el deployment en Vercel

### Error: "Circuit breaker is OPEN"

**Causa:** El circuit breaker se abrió debido a múltiples fallos de conexión.

**Solución:**
1. Primero, resuelve el problema de configuración (ver arriba)
2. Espera 15 segundos (el circuit breaker se recupera automáticamente)
3. O resetea manualmente usando `POST /api/health/reset-circuit-breaker`

### Error: "MaxClientsInSessionMode"

**Causa:** Estás usando Session mode (conexión directa) con muchas conexiones simultáneas.

**Solución:**
1. Cambia a Transaction mode usando `POSTGRES_URL` con el pooler
2. El pooler permite hasta 200 conexiones vs 4-10 en Session mode

## Prevención

Para evitar estos problemas en el futuro:

1. **Siempre usa Transaction mode (pooler)** en producción
2. **Documenta las credenciales** de forma segura (usa un gestor de contraseñas)
3. **Verifica las variables de entorno** después de cada cambio importante
4. **Monitorea los logs** regularmente para detectar problemas temprano

## Contacto

Si después de seguir estos pasos el problema persiste:

1. Revisa los logs detallados en Vercel
2. Verifica el estado del endpoint `/api/health`
3. Contacta al administrador del sistema con:
   - El error específico que estás viendo
   - El resultado de `GET /api/health`
   - Una captura de pantalla de las variables de entorno (sin mostrar valores sensibles)

