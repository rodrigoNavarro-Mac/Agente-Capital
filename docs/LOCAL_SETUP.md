# Configuración para Desarrollo Local

Esta guía te ayudará a configurar el proyecto para que funcione correctamente en tu máquina local.

## Problemas Comunes en Desarrollo Local

### 1. Error de URL de Zoho Duplicada

**Síntoma:**
```
Error 404: La URL de Zoho Accounts no es correcta. 
URL intentada: https://accounts.zoho.com/oauth/v2/token/oauth/v2/token
```

**Causa:** La variable `ZOHO_ACCOUNTS_URL` está configurada incorrectamente. Incluye la ruta `/oauth/v2/token` cuando solo debería contener la URL base.

**Solución:**
En tu archivo `.env.local`, asegúrate de que `ZOHO_ACCOUNTS_URL` sea solo la URL base:

```env
# ✅ CORRECTO
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com

# ❌ INCORRECTO
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com/oauth/v2/token
```

**Regiones de Zoho:**
- US (estándar): `https://accounts.zoho.com`
- EU: `https://accounts.zoho.eu`
- IN: `https://accounts.zoho.in`
- AU: `https://accounts.zoho.com.au`

### 2. Errores de Conexión a PostgreSQL

**Síntoma:**
```
Error: Connection terminated due to connection timeout
Connection terminated unexpectedly
```

**Causa:** PostgreSQL no está corriendo o las variables de entorno no están configuradas correctamente.

**Solución:**

1. **Verifica que PostgreSQL esté corriendo:**
   ```bash
   # Windows (PowerShell)
   Get-Service postgresql*
   
   # Mac/Linux
   pg_isready
   ```

2. **Crea un archivo `.env.local` en la raíz del proyecto:**
   ```env
   # Base de Datos
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=tu_contraseña_aqui
   POSTGRES_DB=capital_plus_agent
   ```

3. **Crea la base de datos si no existe:**
   ```bash
   # Windows (PowerShell)
   createdb -U postgres capital_plus_agent
   
   # Mac/Linux
   createdb capital_plus_agent
   ```

4. **Ejecuta las migraciones:**
   ```bash
   npm run db:migrate:all
   ```

## Configuración Completa de Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto con el siguiente contenido:

```env
# =====================================================
# BASE DE DATOS (PostgreSQL)
# =====================================================
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_contraseña_aqui
POSTGRES_DB=capital_plus_agent

# =====================================================
# PINECONE (REQUERIDO)
# =====================================================
PINECONE_API_KEY=tu-pinecone-api-key-aqui
PINECONE_INDEX_NAME=capitalplus-rag

# =====================================================
# HUGGINGFACE (REQUERIDO para embeddings)
# =====================================================
HUGGINGFACE_API_KEY=tu-huggingface-api-key-aqui

# =====================================================
# LLM (Modelo de Lenguaje)
# =====================================================
# Opción 1: LM Studio (local, gratuito)
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M

# Opción 2: OpenAI (cloud, requiere pago)
# OPENAI_API_KEY=sk-tu-openai-api-key-aqui
# OPENAI_MODEL=gpt-4o-mini

# =====================================================
# ZOHO CRM (Opcional - solo si usas la integración)
# =====================================================
# IMPORTANTE: Solo la URL base, sin rutas
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_CRM_API_URL=https://www.zohoapis.com/crm/v2
ZOHO_CLIENT_ID=tu-zoho-client-id
ZOHO_CLIENT_SECRET=tu-zoho-client-secret
ZOHO_REFRESH_TOKEN=tu-zoho-refresh-token

# =====================================================
# CONFIGURACIÓN DE LA APLICACIÓN
# =====================================================
NODE_ENV=development
UPLOAD_DIR=./tmp
MAX_FILE_SIZE=52428800
CHUNK_SIZE=500
CHUNK_OVERLAP=50
```

## Verificación de la Configuración

Después de configurar las variables de entorno:

1. **Reinicia el servidor de desarrollo:**
   ```bash
   # Detén el servidor (Ctrl+C) y vuelve a iniciarlo
   npm run dev
   ```

2. **Verifica los logs:**
   - Si ves mensajes de advertencia sobre variables faltantes, revisa tu `.env.local`
   - Si ves errores de conexión, verifica que PostgreSQL esté corriendo

3. **Prueba la conexión a la base de datos:**
   - Intenta acceder a cualquier página que use la base de datos
   - Revisa los logs del servidor para ver si hay errores

## Solución de Problemas Adicionales

### PostgreSQL no inicia

**Windows:**
```powershell
# Iniciar el servicio
Start-Service postgresql-x64-14  # Ajusta la versión según tu instalación
```

**Mac (Homebrew):**
```bash
brew services start postgresql@14
```

**Linux:**
```bash
sudo systemctl start postgresql
```

### Puerto 5432 ya está en uso

Si otro proceso está usando el puerto 5432:

1. **Encuentra el proceso:**
   ```bash
   # Windows
   netstat -ano | findstr :5432
   
   # Mac/Linux
   lsof -i :5432
   ```

2. **Detén el proceso o cambia el puerto en `.env.local`:**
   ```env
   POSTGRES_PORT=5433  # Usa otro puerto
   ```

### Variables de entorno no se cargan

Asegúrate de que:
1. El archivo se llama exactamente `.env.local` (con el punto al inicio)
2. Está en la raíz del proyecto (mismo nivel que `package.json`)
3. Has reiniciado el servidor después de crear/modificar el archivo

## Recursos Adicionales

- [README.md](../README.md) - Documentación principal del proyecto
- [QUICKSTART_ES.md](../QUICKSTART_ES.md) - Guía de inicio rápido
- [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) - Configuración para producción en Vercel

