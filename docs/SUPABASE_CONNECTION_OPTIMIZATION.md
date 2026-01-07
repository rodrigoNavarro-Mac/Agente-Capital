# Optimización de Conexiones a Supabase

## Problema Identificado

El error `MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size` ocurre cuando:

1. **Estás usando Supabase en modo Session** (conexión directa)
2. **El límite de conexiones simultáneas es muy bajo** (4-10 según tu plan)
3. **Tu aplicación intenta crear más conexiones de las permitidas**

## Soluciones Implementadas

### 1. Detección Automática de Supabase

El código ahora detecta automáticamente si estás usando Supabase y ajusta el tamaño del pool:

- **Transaction mode (Pooler)**: Hasta 200 conexiones simultáneas
- **Session mode (Direct)**: Solo 4-10 conexiones simultáneas

### 2. Priorización de Transaction Mode

El código ahora prioriza `POSTGRES_URL` (Transaction mode) sobre `POSTGRES_URL_NON_POOLING` (Session mode) para evitar límites de conexiones.

### 3. Ajuste Automático del Pool

- **Supabase Transaction mode**: Pool de 5-10 conexiones (configurable)
- **Supabase Session mode**: Pool de 3-4 conexiones (muy limitado)
- **PostgreSQL estándar**: Pool de 5-20 conexiones según entorno

### 4. Función `withClient()` para Garantizar Liberación

Nueva función que garantiza que las conexiones siempre se liberen:

```typescript
import { withClient } from '@/lib/postgres';

// Ejemplo de uso
const result = await withClient(async (client) => {
  await client.query('BEGIN');
  try {
    const result = await client.query('INSERT INTO ...');
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  // La conexión se libera automáticamente aquí
});
```

## Configuración Recomendada

### Opción 1: Transaction Mode (RECOMENDADO) ⭐

**Ventajas:**
- Permite hasta 200 conexiones simultáneas
- Mejor rendimiento en aplicaciones con muchas peticiones
- Evita el error "MaxClientsInSessionMode"

**Pasos:**

1. Ve a **Supabase Dashboard** > **Settings** > **Database**
2. Busca la sección **Connection String**
3. Selecciona **"Connection pooling"** (Transaction mode)
4. Copia la cadena de conexión
5. Configúrala como `POSTGRES_URL` en tus variables de entorno:

```bash
# .env.local (desarrollo)
POSTGRES_URL=postgresql://postgres:[PASSWORD]@[PROJECT-REF].supabase.co:6543/postgres?pgbouncer=true

# Vercel (producción)
# Ve a Vercel Dashboard > Settings > Environment Variables
# Agrega POSTGRES_URL con la cadena de Transaction mode
```

**Nota:** La cadena de Transaction mode incluye `pgbouncer=true` y usa el puerto `6543`.

### Opción 2: Session Mode (NO RECOMENDADO)

**Desventajas:**
- Solo permite 4-10 conexiones simultáneas
- Puede causar errores en aplicaciones con mucho tráfico
- Requiere reducir el tamaño del pool manualmente

**Si debes usarlo:**

1. Configura `POSTGRES_URL_NON_POOLING` (Session mode)
2. Reduce el tamaño del pool en `.env.local`:

```bash
POSTGRES_MAX_CONNECTIONS=3
```

## Variables de Entorno

### Orden de Prioridad (de mayor a menor)

1. `POSTGRES_URL` - Pooler de Supabase (Transaction mode) ⭐ RECOMENDADO
2. `DATABASE_URL` - Configuración manual
3. `POSTGRES_URL_NON_POOLING` - Session mode (limitado)
4. `POSTGRES_PRISMA_URL` - Variable alternativa

### Variables de Configuración

```bash
# Tamaño máximo del pool (ajustado automáticamente para Supabase)
POSTGRES_MAX_CONNECTIONS=10

# Timeout de conexión (ms)
POSTGRES_CONNECTION_TIMEOUT=15000

# Timeout de conexiones inactivas (ms)
POSTGRES_IDLE_TIMEOUT=30000
```

## Detección de Errores

El código ahora detecta automáticamente el error `MaxClientsInSessionMode` y muestra mensajes útiles:

```
⚠️ ERROR: Límite de conexiones de Supabase alcanzado (Session mode)
   SOLUCIÓN RECOMENDADA:
   1. Usa el pooler de Supabase (Transaction mode) en lugar de conexión directa
   2. Ve a Supabase Dashboard > Settings > Database > Connection String
   3. Copia la cadena de "Connection pooling" (Transaction mode)
   4. Configúrala como POSTGRES_URL en tus variables de entorno
   5. Esto permite hasta 200 conexiones simultáneas vs 4-10 en Session mode
```

## Mejoras en el Código

### 1. Detección Automática

```typescript
// El código detecta automáticamente:
const isSupabasePooler = !!process.env.POSTGRES_URL; // Transaction mode
const isSupabaseDirect = !!process.env.POSTGRES_URL_NON_POOLING; // Session mode
```

### 2. Ajuste del Pool

```typescript
// Ajusta automáticamente el tamaño según el modo:
if (isSupabasePooler) {
  maxConnections = 10; // Transaction mode permite más
} else if (isSupabaseDirect) {
  maxConnections = 4; // Session mode muy limitado
}
```

### 3. Manejo de Errores

```typescript
// Detecta el error específico y sugiere solución
if (error.message.includes('MaxClientsInSessionMode')) {
  logger.error('⚠️ Usa POSTGRES_URL (Transaction mode) para más conexiones');
}
```

## Comparación de Modos

| Característica | Transaction Mode | Session Mode |
|---------------|-------------------|--------------|
| **Conexiones máximas** | 200 | 4-10 |
| **Puerto** | 6543 | 5432 |
| **Pooler** | Sí (PgBouncer) | No |
| **Recomendado para** | Producción, alto tráfico | Desarrollo, bajo tráfico |
| **Variable de entorno** | `POSTGRES_URL` | `POSTGRES_URL_NON_POOLING` |

## Próximos Pasos

1. **Configura `POSTGRES_URL`** con la cadena de Transaction mode
2. **Elimina o reduce la prioridad** de `POSTGRES_URL_NON_POOLING`
3. **Reinicia tu aplicación** para aplicar los cambios
4. **Monitorea los logs** para confirmar que usa Transaction mode

## Verificación

Para verificar que estás usando Transaction mode, busca en los logs:

```
[app:postgres] Configuración del pool de conexiones {
  maxConnections: 10,
  isSupabase: true,
  isSupabasePooler: true,
  connectionMode: 'Transaction (Pooler)'
}
```

Si ves `connectionMode: 'Session (Direct)'`, cambia a `POSTGRES_URL`.


