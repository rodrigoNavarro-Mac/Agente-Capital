# Configuración del entorno

---

## Requisitos

- Node.js 18+
- PostgreSQL 15+ (o cuenta en Supabase)
- Cuenta de Meta Business con WhatsApp Cloud API habilitada
- Cuenta de Zoho CRM con OAuth configurado
- API key de OpenAI
- API key de Anthropic

---

## Setup local

### 1. Clonar e instalar

```bash
git clone <repo>
cd Agente
npm install
```

### 2. Crear `.env.local`

Crear el archivo en la raíz del proyecto (mismo nivel que `package.json`):

```env
# =====================================================
# BASE DE DATOS
# =====================================================
# Opción A: variables separadas (desarrollo local)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_contraseña
POSTGRES_DB=capital_agente

# Opción B: connection string (recomendada para Supabase)
DATABASE_URL=postgresql://postgres:password@localhost:5432/capital_agente

# =====================================================
# LLM
# =====================================================
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Alternativa local (LM Studio)
# LMSTUDIO_BASE_URL=http://localhost:1234/v1
# LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M

# =====================================================
# ANTHROPIC (context extractor)
# =====================================================
ANTHROPIC_API_KEY=sk-ant-...

# =====================================================
# AUTH
# =====================================================
JWT_SECRET=una-cadena-larga-y-aleatoria
JWT_REFRESH_SECRET=otra-cadena-larga-y-aleatoria

# =====================================================
# WHATSAPP (no necesario en desarrollo local sin webhook)
# =====================================================
WHATSAPP_VERIFY_TOKEN=tu_token_de_verificacion
WHATSAPP_API_TOKEN=tu_token_de_acceso_meta
WHATSAPP_PHONE_NUMBER_ID_FUEGO=...
WHATSAPP_PHONE_NUMBER_ID_AMURA=...
WHATSAPP_PHONE_NUMBER_ID_PUNTO_TIERRA=...

# =====================================================
# ZOHO CRM
# =====================================================
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_CRM_API_URL=https://www.zohoapis.com/crm/v2
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...

# =====================================================
# ZOHO CLIQ
# =====================================================
ZOHO_CLIQ_WEBHOOK_TOKEN=...
ZOHO_CLIQ_BOT_WEBHOOK_URL=...
ZOHO_CLIQ_API_URL=https://cliq.zoho.com/api/v2

# =====================================================
# RAG (opcional si no usas el chat)
# =====================================================
# PINECONE_API_KEY=...
# PINECONE_INDEX_NAME=capitalplus-rag
# HUGGINGFACE_API_KEY=...
```

### 3. Crear la base de datos y aplicar migraciones

```bash
# Crear la BD (si no existe)
createdb -U postgres capital_agente

# Aplicar todas las migraciones
npm run db:migrate:all
```

### 4. Iniciar el servidor

```bash
npm run dev
# Disponible en http://localhost:3000
```

---

## Solución de problemas comunes (local)

### Error de conexión PostgreSQL

```
Connection terminated due to connection timeout
```

1. Verificar que PostgreSQL esté corriendo:
   ```bash
   # Windows
   Get-Service postgresql*
   # Mac/Linux
   pg_isready
   ```
2. Iniciar el servicio si está detenido:
   ```bash
   # Windows
   Start-Service postgresql-x64-15
   # Mac (Homebrew)
   brew services start postgresql@15
   # Linux
   sudo systemctl start postgresql
   ```

### ZOHO_ACCOUNTS_URL duplicado

```
URL intentada: https://accounts.zoho.com/oauth/v2/token/oauth/v2/token
```

La variable debe ser solo la URL base, **sin** rutas:
```env
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com   # correcto
```

### Variables de entorno no se cargan

- El archivo debe llamarse exactamente `.env.local`
- Debe estar en la raíz del proyecto
- Reiniciar el servidor después de modificarlo

---

## Configuración en Vercel (producción)

### Base de datos: Supabase con Transaction Pooling

En producción, usar el **connection string de Transaction Pooling** (puerto 6543), no el directo. Esto es obligatorio para funciones serverless de Vercel.

1. Ir a Supabase Dashboard → Settings → Database → Connection pooling
2. Seleccionar modo **Transaction** y copiar la URI (puerto 6543)
3. En Vercel Dashboard → Settings → Environment Variables, agregar:
   ```
   DATABASE_URL = postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```

### Contraseñas con caracteres especiales

Si la contraseña tiene `&`, `%`, `+`, `#`, etc., hay que URL-encodearlos:
```javascript
// En consola del navegador:
encodeURIComponent('tu_contraseña')
```

Caracteres frecuentes:
- `&` → `%26`
- `%` → `%25`
- `+` → `%2B`
- `#` → `%23`

### Variables requeridas en Vercel

Las mismas que en `.env.local`, pero con los valores de producción:

```
DATABASE_URL           postgresql://... (Transaction pooling de Supabase)
OPENAI_API_KEY         sk-...
ANTHROPIC_API_KEY      sk-ant-...
JWT_SECRET             cadena larga aleatoria
JWT_REFRESH_SECRET     cadena larga aleatoria
WHATSAPP_VERIFY_TOKEN  token del webhook Meta
WHATSAPP_API_TOKEN     token de acceso Meta
WHATSAPP_PHONE_NUMBER_ID_FUEGO / AMURA / PUNTO_TIERRA
ZOHO_ACCOUNTS_URL      https://accounts.zoho.com
ZOHO_CRM_API_URL       https://www.zohoapis.com/crm/v2
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_REFRESH_TOKEN
ZOHO_CLIQ_WEBHOOK_TOKEN
ZOHO_CLIQ_BOT_WEBHOOK_URL
ZOHO_CLIQ_API_URL      https://cliq.zoho.com/api/v2
```

### Verificar el deploy

```bash
# Health check
curl https://tu-app.vercel.app/api/health
```

Si el health check responde `{"status":"ok"}`, la conexión a BD y configuración básica están correctas.

---

## Migraciones en producción

Ejecutar manualmente con `DATABASE_URL` apuntando a Supabase:

```bash
DATABASE_URL=postgresql://... npm run db:migrate:all
```

O desde Supabase Dashboard → SQL Editor, ejecutando los archivos en `migrations/` en orden.
