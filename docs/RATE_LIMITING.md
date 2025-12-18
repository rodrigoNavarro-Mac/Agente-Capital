# Rate Limiting - Documentación

## 📋 Resumen

Este sistema implementa **rate limiting** (límite de solicitudes) para proteger los endpoints de la API contra:
- Ataques DDoS (Denial of Service)
- Abuso de API
- Consumo excesivo de recursos (Pinecone, OpenAI, HuggingFace)
- Costos elevados en servicios externos

## Arquitectura

El sistema de rate limiting utiliza:

1. **@upstash/ratelimit**: Biblioteca para rate limiting serverless-friendly
2. **@upstash/redis**: Almacenamiento en Redis (compatible con serverless)
3. **Middleware de Next.js**: Aplicación automática en todas las rutas de API
4. **Fallback en memoria**: Para desarrollo local cuando Upstash no está configurado

## Configuración

### Variables de Entorno Requeridas (Producción)

Para usar rate limiting en producción, necesitas configurar Upstash Redis:

```env
# Upstash Redis (REQUERIDO para producción)
UPSTASH_REDIS_REST_URL=https://tu-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=tu-token-aqui
```

### Obtener Credenciales de Upstash

1. Ve a [Upstash Console](https://console.upstash.com/)
2. Crea una nueva base de datos Redis (gratis hasta 10,000 requests/día)
3. Una vez creada, ve a la sección **"REST API"** (no uses "Redis CLI" ni "Connection String")
4. Copia la **REST URL** (debe comenzar con `https://`) y el **REST TOKEN**
5. Agrega estas variables en tu archivo `.env.local` o en Vercel

⚠️ **IMPORTANTE - Errores Comunes:**

-  **NO uses** la URL de "Redis CLI" (que contiene `redis-cli --tls -u redis://...`)
-  **NO uses** la "Connection String" (que contiene `redis://...`)
- **SÍ usa** la **REST URL** de la sección "REST API" (que comienza con `https://...`)

**Ejemplo correcto:**
```env
UPSTASH_REDIS_REST_URL=https://known-poodle-32380.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX58AAIncDE1YzE2ZDA4ZjFhMDk0OWY5YjhkNjEwZGZiODg0ZjI5YXAxMzIzODA
```

**Ejemplo incorrecto (NO usar):**
```env
#  Esto es un comando de redis-cli, NO una REST URL
UPSTASH_REDIS_REST_URL=redis-cli --tls -u redis://default:TOKEN@host:6379

#  Esto es una connection string, NO una REST URL
UPSTASH_REDIS_REST_URL=redis://default:TOKEN@host:6379
```

### Desarrollo Local (Opcional)

Para desarrollo local, puedes:
- **Opción 1**: Configurar Upstash (recomendado, funciona igual que producción)
- **Opción 2**: No configurar Upstash (el sistema usará un fallback en memoria)

 **Nota**: El fallback en memoria solo funciona en desarrollo. En producción con múltiples instancias serverless, cada instancia tendría su propio contador, por lo que **debes usar Upstash en producción**.

##  Límites Configurados

Los límites actuales están definidos en `src/lib/rate-limit.ts`:

| Endpoint | Límite | Ventana | Descripción |
|----------|--------|---------|-------------|
| `rag-query` | 30 requests | 1 minuto | Consultas RAG (costosas) |
| `rag-feedback` | 20 requests | 1 minuto | Feedback de respuestas |
| `upload` | 10 requests | 1 hora | Subida de documentos |
| `auth-login` | 5 intentos | 15 minutos | Protección contra brute force |
| `auth-refresh` | 20 requests | 1 minuto | Refresh de tokens |
| `zoho` | 50 requests | 1 minuto | Llamadas a Zoho CRM |
| `api` | 100 requests | 1 minuto | Endpoints generales |

### Personalizar Límites

Puedes modificar los límites editando `RATE_LIMITS` en `src/lib/rate-limit.ts`:

```typescript
export const RATE_LIMITS = {
  'rag-query': {
    requests: 30,  // Cambiar este número
    window: '1m',  // Cambiar la ventana (10s, 1m, 1h, 1d)
  },
  // ... más endpoints
};
```

##  Cómo Funciona

### 1. Identificación de Usuarios

El sistema identifica usuarios de la siguiente manera (en orden de prioridad):

1. **UserId del token JWT** (si está autenticado)
2. **Dirección IP** (si no hay token)
3. **"anonymous"** (si no hay IP disponible)

Esto significa que:
- Usuarios autenticados tienen límites individuales
- Usuarios no autenticados comparten límite por IP

### 2. Aplicación Automática

El middleware (`src/middleware.ts`) aplica rate limiting automáticamente a todas las rutas `/api/*` antes de que lleguen a los endpoints.

### 3. Respuesta cuando se Excede el Límite

Cuando un usuario excede el límite, recibe:

```json
{
  "success": false,
  "error": "Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.",
  "retryAfter": 45
}
```

Con código HTTP **429 (Too Many Requests)** y headers:

- `Retry-After`: Segundos hasta que se puede intentar de nuevo
- `X-RateLimit-Limit`: Límite máximo
- `X-RateLimit-Remaining`: Solicitudes restantes (0 cuando está bloqueado)
- `X-RateLimit-Reset`: Timestamp de cuando se resetea el contador

## 🛠️ Uso Manual en Endpoints

Si necesitas aplicar rate limiting manualmente en un endpoint específico (por ejemplo, con lógica personalizada), puedes usar:

```typescript
import { applyRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Obtener userId del token
  const payload = verifyAccessToken(token);
  
  // Aplicar rate limiting
  const rateLimitResponse = await applyRateLimit(
    request,
    'rag-query', // tipo de endpoint
    payload?.userId // userId opcional
  );
  
  // Si se excedió el límite, retornar la respuesta
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
  // Continuar con la lógica del endpoint...
}
```

##  Pruebas

### Verificar que Rate Limiting Funciona

1. **Hacer múltiples requests rápidos** a un endpoint protegido:

```bash
# Hacer 35 requests rápidas a /api/rag-query (límite: 30/min)
for i in {1..35}; do
  curl -X POST http://localhost:3000/api/rag-query \
    -H "Authorization: Bearer TU_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"test","zone":"yucatan","development":"test"}'
  echo ""
done
```

2. **Verificar logs**: Deberías ver warnings en los logs cuando se excede el límite
3. **Verificar respuesta 429**: Las requests después del límite deberían retornar 429

### Verificar Headers de Rate Limit

```bash
curl -I -X POST http://localhost:3000/api/rag-query \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","zone":"yucatan","development":"test"}'
```

Deberías ver headers como:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1234567890
```

## Troubleshooting

### Rate Limiting No Funciona

1. **Verificar variables de entorno**:
   ```bash
   echo $UPSTASH_REDIS_REST_URL
   echo $UPSTASH_REDIS_REST_TOKEN
   ```

2. **Verificar logs**: Busca mensajes de "Upstash Redis no configurado" o errores de conexión

3. **En desarrollo**: Si no configuraste Upstash, el sistema usa fallback en memoria (debería funcionar)

### Errores de Conexión a Upstash

#### Error: "Upstash Redis client was passed an invalid URL. You should pass a URL starting with https."

**Causa:** Copiaste la URL incorrecta de Upstash. Probablemente copiaste:
- La URL de "Redis CLI" (que contiene `redis-cli --tls -u redis://...`)
- La "Connection String" (que contiene `redis://...`)

**Solución:**
1. Ve a [Upstash Console](https://console.upstash.com/)
2. Selecciona tu base de datos Redis
3. Ve a la pestaña **"REST API"** (NO "Redis CLI" ni "Connection String")
4. Copia la **REST URL** que comienza con `https://`
5. Actualiza tu variable de entorno:
   ```env
   UPSTASH_REDIS_REST_URL=https://tu-redis.upstash.io  # ✅ Correcto
   ```
6. Reinicia tu servidor

**Otros errores comunes:**
- Verifica que las credenciales sean correctas
- Verifica que la base de datos de Upstash esté activa
- Revisa los logs para ver el error específico
- Asegúrate de que la URL no tenga espacios al inicio o final

### Límites Muy Estrictos

Si los límites son muy estrictos para tu caso de uso:

1. Edita `RATE_LIMITS` en `src/lib/rate-limit.ts`
2. Aumenta el número de `requests` o la `window`
3. Redespliega la aplicación

## 📈 Monitoreo

El sistema registra automáticamente:

- **Warnings**: Cuando se excede un rate limit
- **Errors**: Cuando hay problemas con Redis
- **Debug**: Información sobre rate limits aplicados

Busca en los logs por el scope `'rate-limit'` para ver toda la actividad.

## 🔒 Seguridad

### Protecciones Implementadas

1. **Fail Open**: Si hay un error en rate limiting, se permite la request (evita bloqueos por errores técnicos)
2. **Identificación por Usuario**: Usuarios autenticados tienen límites individuales
3. **Identificación por IP**: Usuarios no autenticados se limitan por IP
4. **Sliding Window**: Ventana deslizante (más preciso que fixed window)

### Consideraciones

- **IP Spoofing**: En producción, confía en los headers `x-forwarded-for` y `x-real-ip` de tu proxy/load balancer
- **Múltiples Usuarios Misma IP**: Compartirán el límite si no están autenticados
- **Bypass**: El rate limiting se aplica en middleware, pero endpoints pueden tener lógica adicional

## 📚 Referencias

- [Upstash Rate Limiting Docs](https://upstash.com/docs/redis/features/ratelimiting)
- [Next.js Middleware Docs](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [HTTP 429 Status Code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429)

