# Configuración de Tareas Programadas (Cron Jobs)

Este documento explica cómo configurar la ejecución automática diaria del procesamiento de feedback.

## 📋 Endpoint de Cron

El sistema incluye un endpoint API protegido para procesar feedback automáticamente:

**Endpoint:** `POST /api/cron/process-feedback-learning`

**Autenticación:** Requiere un secret key configurado en `CRON_SECRET`

## 🚀 Opción 1: Vercel Cron (Recomendado si usas Vercel)

Si tu aplicación está desplegada en Vercel, el archivo `vercel.json` ya está configurado para ejecutar el procesamiento diariamente a las 2 AM.

### Configuración en Vercel:

1. **Agregar variable de entorno:**
   - Ve a tu proyecto en Vercel
   - Settings → Environment Variables
   - Agrega: `CRON_SECRET` con un valor secreto (ej: genera uno con `openssl rand -hex 32`)

2. **Verificar configuración:**
   - El archivo `vercel.json` ya está configurado
   - El cron job se ejecutará automáticamente cada día a las 2 AM (UTC)

3. **Probar manualmente:**
   ```bash
   curl -X POST https://tu-dominio.vercel.app/api/cron/process-feedback-learning \
     -H "Authorization: Bearer TU_CRON_SECRET"
   ```

## 🔧 Opción 2: Cron Job Externo (Linux/Mac)

Si no usas Vercel o prefieres un cron job en tu servidor:

### 1. Configurar variable de entorno:

```bash
# En .env.local o variables de entorno del sistema
export CRON_SECRET="tu-secret-key-aqui"
```

### 2. Crear script wrapper:

Crea un archivo `scripts/cron-process-feedback.sh`:

```bash
#!/bin/bash
# Script para ejecutar procesamiento de feedback vía API

CRON_SECRET="tu-secret-key-aqui"
API_URL="https://tu-dominio.com/api/cron/process-feedback-learning"

curl -X POST "$API_URL" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  >> /var/log/feedback-learning.log 2>&1
```

Hacer ejecutable:
```bash
chmod +x scripts/cron-process-feedback.sh
```

### 3. Configurar cron job:

```bash
# Editar crontab
crontab -e

# Agregar línea para ejecutar diariamente a las 2 AM
0 2 * * * /ruta/completa/al/proyecto/scripts/cron-process-feedback.sh
```

## 🪟 Opción 3: Windows Task Scheduler

Si usas Windows:

1. **Abrir Task Scheduler** (Programador de tareas)

2. **Crear tarea básica:**
   - Nombre: "Procesar Feedback Aprendizaje"
   - Trigger: Diariamente a las 2:00 AM
   - Acción: Iniciar un programa
   - Programa: `curl.exe` (o PowerShell)
   - Argumentos:
     ```
     -X POST https://tu-dominio.com/api/cron/process-feedback-learning -H "Authorization: Bearer TU_CRON_SECRET"
     ```

3. **Alternativa con PowerShell:**
   Crear script `scripts/cron-process-feedback.ps1`:
   ```powershell
   $headers = @{
       "Authorization" = "Bearer TU_CRON_SECRET"
   }
   Invoke-RestMethod -Uri "https://tu-dominio.com/api/cron/process-feedback-learning" -Method Post -Headers $headers
   ```

## 🔐 Seguridad

**IMPORTANTE:** El endpoint está protegido con un secret key. Asegúrate de:

1. **Generar un secret seguro:**
   ```bash
   # Linux/Mac
   openssl rand -hex 32
   
   # Windows/Mac/Linux - Usar Node.js (Recomendado)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Windows PowerShell - Alternativa nativa
   -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Minimum 0 -Maximum 16) })
   ```

2. **Nunca commitear el secret:**
   - Agregar `CRON_SECRET` a `.env.local` (ya está en `.gitignore`)
   - No incluir el secret en el código fuente

3. **Usar diferentes secrets por ambiente:**
   - Desarrollo: `CRON_SECRET_DEV`
   - Producción: `CRON_SECRET_PROD`

## 📊 Monitoreo

### Ver logs en Vercel:
- Ve a tu proyecto → Deployments → Functions
- Busca ejecuciones del cron job

### Ver logs localmente:
```bash
# Si usas cron job externo
tail -f /var/log/feedback-learning.log

# O ver logs de la aplicación
# Los logs se muestran en la consola cuando se ejecuta el endpoint
```

### Verificar que funciona:
```bash
# Llamar manualmente al endpoint
curl -X POST http://localhost:3000/api/cron/process-feedback-learning \
  -H "Authorization: Bearer tu-secret-key"
```

## ⚙️ Personalizar Horario

### En Vercel:
Edita `vercel.json` y cambia el schedule:
```json
{
  "crons": [
    {
      "path": "/api/cron/process-feedback-learning",
      "schedule": "0 3 * * *"  // 3 AM en lugar de 2 AM
    }
  ]
}
```

### En Cron (Linux/Mac):
Cambia la hora en crontab:
```
0 3 * * *  # 3 AM
0 */6 * * *  # Cada 6 horas
0 0 * * 0  # Cada domingo a medianoche
```

Formato: `minuto hora día mes día-semana`

## 🧪 Testing

Para probar el endpoint manualmente:

```bash
# Con curl
curl -X POST http://localhost:3000/api/cron/process-feedback-learning \
  -H "Authorization: Bearer tu-secret-key" \
  -H "Content-Type: application/json"

# O usando el secret como query param (menos seguro, solo para testing)
curl -X POST "http://localhost:3000/api/cron/process-feedback-learning?secret=tu-secret-key"
```

## 📝 Notas

- El procesamiento analiza feedback de las **últimas 24 horas**
- Solo procesa feedback con `feedback_rating` no nulo
- Las respuestas aprendidas se actualizan o crean automáticamente
- El sistema es idempotente: puede ejecutarse múltiples veces sin problemas

