/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - RATE LIMITING
 * =====================================================
 * Sistema de rate limiting para proteger los endpoints de la API
 * contra abuso, DDoS y consumo excesivo de recursos.
 * 
 * Usa @upstash/ratelimit para almacenamiento serverless-friendly.
 * En desarrollo, usa un fallback en memoria si Upstash no está configurado.
 */

import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, type RateLimitKey } from './rate-limit-config';

export { type RateLimitKey };

// =====================================================
// INICIALIZACIÓN DE REDIS (UPSTASH)
// =====================================================

/**
 * Valida y limpia la URL de Upstash Redis.
 * Detecta URLs mal formadas (como comandos de redis-cli) y las corrige.
 */
function validateAndCleanUpstashUrl(url: string): string | null {
  if (!url) return null;

  // Detectar si es un comando de redis-cli (error común)
  if (url.includes('redis-cli') || url.startsWith('redis://')) {
    logger.error(
      'URL de Upstash Redis incorrecta. Parece ser un comando de redis-cli o URL redis://',
      undefined,
      {
        hint: 'La REST URL debe comenzar con https:// y obtenerse desde Upstash Console > REST API',
        received: url.substring(0, 100), // Solo mostrar primeros 100 caracteres por seguridad
      },
      'rate-limit'
    );
    return null;
  }

  // Validar que sea una URL HTTPS válida
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'https:') {
      logger.error(
        'URL de Upstash Redis debe usar HTTPS',
        undefined,
        {
          received: urlObj.protocol,
          hint: 'La REST URL debe comenzar con https://',
        },
        'rate-limit'
      );
      return null;
    }

    // Validar que sea un dominio de Upstash
    if (!urlObj.hostname.includes('upstash.io')) {
      logger.warn(
        'URL de Upstash Redis no parece ser de upstash.io',
        {
          hostname: urlObj.hostname,
          hint: 'Asegúrate de usar la REST URL de Upstash Console',
        },
        'rate-limit'
      );
    }

    return url;
  } catch (error) {
    logger.error(
      'URL de Upstash Redis inválida',
      error,
      {
        hint: 'La URL debe ser válida y comenzar con https://',
      },
      'rate-limit'
    );
    return null;
  }
}

/**
 * Inicializa el cliente de Redis de Upstash.
 * Si las variables de entorno no están configuradas, retorna null
 * y se usará un fallback en memoria para desarrollo.
 */
function initRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn(
      'Upstash Redis no configurado. Rate limiting usará fallback en memoria (solo desarrollo)',
      {
        hint: 'Para producción, configura UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN',
      },
      'rate-limit'
    );
    return null;
  }

  // Validar y limpiar la URL
  const cleanUrl = validateAndCleanUpstashUrl(url);
  if (!cleanUrl) {
    logger.error(
      'URL de Upstash Redis inválida. Rate limiting usará fallback en memoria',
      undefined,
      {
        hint: 'Verifica que UPSTASH_REDIS_REST_URL sea la REST URL de Upstash Console (https://...)',
        docs: 'Ver docs/RATE_LIMITING.md para instrucciones',
      },
      'rate-limit'
    );
    return null;
  }

  try {
    return new Redis({
      url: cleanUrl,
      token,
    });
  } catch (error) {
    logger.error(
      'Error inicializando Upstash Redis',
      error,
      {
        hint: 'Verifica que las credenciales sean correctas en Upstash Console',
      },
      'rate-limit'
    );
    return null;
  }
}

// Cliente de Redis (se inicializa una vez)
let redisClient: Redis | null = null;

/**
 * Obtiene el cliente de Redis, inicializándolo si es necesario.
 */
function getRedisClient(): Redis | null {
  if (redisClient === null) {
    redisClient = initRedis();
  }
  return redisClient;
}

// =====================================================
// FALLBACK EN MEMORIA (SOLO DESARROLLO)
// =====================================================

/**
 * Implementación simple de rate limiting en memoria.
 * Solo para desarrollo cuando Upstash no está configurado.
 * 
 * ADVERTENCIA: No funciona en producción con múltiples instancias serverless.
 */
class InMemoryRateLimit {
  private store: Map<string, { count: number; resetAt: number }> = new Map();

  /**
   * Verifica si un identificador ha excedido el límite.
   */
  async check(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now();
    const key = identifier;
    const record = this.store.get(key);

    // Si no existe registro o ya expiró, crear uno nuevo
    if (!record || now > record.resetAt) {
      this.store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      return {
        success: true,
        limit,
        remaining: limit - 1,
        reset: now + windowMs,
      };
    }

    // Si ya alcanzó el límite
    if (record.count >= limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        reset: record.resetAt,
      };
    }

    // Incrementar contador
    record.count++;
    this.store.set(key, record);

    return {
      success: true,
      limit,
      remaining: limit - record.count,
      reset: record.resetAt,
    };
  }

  /**
   * Limpia registros expirados (para evitar memory leaks).
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of Array.from(this.store.entries())) {
      if (now > record.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// Instancia global del fallback en memoria
const inMemoryRateLimit = new InMemoryRateLimit();

// Limpiar registros expirados cada 5 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    inMemoryRateLimit.cleanup();
  }, 5 * 60 * 1000);
}

// =====================================================
// HELPER PRINCIPAL DE RATE LIMITING
// =====================================================

/**
 * Convierte una ventana de tiempo (ej: '1m', '10s') a milisegundos.
 */
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Formato de ventana inválido: ${window}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,        // segundos
    m: 60 * 1000,   // minutos
    h: 60 * 60 * 1000, // horas
    d: 24 * 60 * 60 * 1000, // días
  };

  return value * multipliers[unit];
}

/**
 * Crea un identificador único para rate limiting.
 * Prioriza userId si está disponible, sino usa IP.
 */
function createIdentifier(userId?: number | string, ip?: string): string {
  if (userId) {
    return `user:${userId}`;
  }
  if (ip) {
    return `ip:${ip}`;
  }
  return 'anonymous';
}

/**
 * Verifica el rate limit para un endpoint específico.
 * 
 * @param endpoint - Clave del endpoint (ej: 'rag-query', 'upload')
 * @param identifier - Identificador único (userId o IP)
 * @returns Objeto con información del rate limit
 */
export async function checkRateLimit(
  endpoint: RateLimitKey,
  identifier: string
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  const config = RATE_LIMITS[endpoint];
  if (!config) {
    // Si no hay configuración, permitir (no limitar)
    logger.warn(
      `No hay configuración de rate limit para endpoint: ${endpoint}`,
      {},
      'rate-limit'
    );
    return {
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: Date.now(),
    };
  }

  const { requests, window } = config;
  const windowMs = parseWindow(window);

  const redis = getRedisClient();

  // Si Redis está disponible, usarlo (producción)
  if (redis) {
    try {
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, window as Duration),
        analytics: true,
      });

      const result = await ratelimit.limit(identifier);

      return {
        success: result.success,
        limit: requests,
        remaining: result.remaining,
        reset: result.reset,
      };
    } catch (error) {
      logger.error(
        'Error en rate limiting con Redis, usando fallback',
        error,
        { endpoint },
        'rate-limit'
      );
      // Fallback a memoria si Redis falla
    }
  }

  // Fallback en memoria (solo desarrollo)
  return await inMemoryRateLimit.check(identifier, requests, windowMs);
}

/**
 * Helper para aplicar rate limiting en un endpoint de Next.js.
 * 
 * @param request - Request de Next.js
 * @param endpoint - Clave del endpoint
 * @param userId - ID del usuario (opcional, se obtiene del token si no se proporciona)
 * @returns NextResponse con error 429 si se excede el límite, o null si está OK
 */
export async function applyRateLimit(
  request: Request,
  endpoint: RateLimitKey,
  userId?: number | string
): Promise<Response | null> {
  try {
    // Obtener IP del request
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() :
      request.headers.get('x-real-ip') ||
      'unknown';

    // Crear identificador (priorizar userId si está disponible)
    const identifier = createIdentifier(userId, ip);

    // Verificar rate limit
    const result = await checkRateLimit(endpoint, identifier);

    if (!result.success) {
      // Calcular segundos hasta el reset
      const resetSeconds = Math.ceil((result.reset - Date.now()) / 1000);

      logger.warn(
        `Rate limit excedido para ${endpoint}`,
        { identifier, limit: result.limit, resetSeconds },
        'rate-limit'
      );

      // Retornar respuesta 429 (Too Many Requests)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.',
          retryAfter: resetSeconds,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': resetSeconds.toString(),
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.reset.toString(),
          },
        }
      );
    }

    // Rate limit OK, retornar null para continuar
    return null;
  } catch (error) {
    // En caso de error, permitir la request (fail open)
    // pero registrar el error
    logger.error(
      'Error verificando rate limit, permitiendo request',
      error,
      { endpoint },
      'rate-limit'
    );
    return null;
  }
}

