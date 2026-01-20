/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - EDGE RATE LIMITING
 * =====================================================
 * Implementación de rate limiting específica para Edge Runtime (Middleware).
 */

import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { RATE_LIMITS, type RateLimitKey } from './rate-limit-config';

// Inicializar Redis solo si las variables están seteadas
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (redisUrl && redisToken)
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

// Cache en memoria simple para fallback en Edge
// Nota: En Edge, esta memoria es efímera y local a la región
// Cache en memoria simple para fallback en Edge
// Nota: En Edge, esta memoria es efímera y local a la región
// const ephemeralCache = new Map<string, number>();



export async function applyRateLimit(
    request: Request,
    endpoint: RateLimitKey,
    userId?: number | string
): Promise<Response | null> {
    // Si no hay Redis configurado, permitir todo (o usar caché básica)
    // En producción real, Redis es obligatorio para rate limit distribuido
    if (!redis) {
        return null;
    }

    const config = RATE_LIMITS[endpoint];
    if (!config) return null;

    try {
        // Identificador
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
        const identifier = userId ? `user:${userId}` : `ip:${ip}`;

        // Usar Ratelimit de Upstash
        const ratelimit = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(config.requests, config.window as Duration),
            analytics: true,
            prefix: '@upstash/ratelimit',
        });

        const { success, limit, reset, remaining } = await ratelimit.limit(identifier);

        if (!success) {
            const resetSeconds = Math.ceil((reset - Date.now()) / 1000);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Rate limit exceeded',
                    retryAfter: resetSeconds
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': resetSeconds.toString(),
                        'X-RateLimit-Limit': limit.toString(),
                        'X-RateLimit-Remaining': remaining.toString(),
                        'X-RateLimit-Reset': reset.toString(),
                    },
                }
            );
        }

        return null;
    } catch (error) {
        // Fail open
        console.error('Rate limit error:', error);
        return null;
    }
}
