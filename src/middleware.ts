/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - MIDDLEWARE
 * =====================================================
 * Middleware de Next.js para aplicar rate limiting
 * y otras protecciones a nivel de aplicación.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/infrastructure/rate-limit-edge';
import { type RateLimitKey } from '@/lib/config/rate-limit-config';
import { extractTokenFromHeader, verifyAccessTokenEdge } from '@/lib/auth/auth-edge';

/**
 * Mapeo de rutas a sus respectivos rate limits.
 * Las rutas se matchean por prefijo.
 */
const ROUTE_RATE_LIMITS: Record<string, RateLimitKey> = {
  '/api/rag-query': 'rag-query',
  '/api/rag-feedback': 'rag-feedback',
  '/api/upload': 'upload',
  '/api/auth/login': 'auth-login',
  '/api/auth/refresh': 'auth-refresh',
  '/api/zoho': 'zoho',
};

/**
 * Middleware principal de Next.js.
 * Se ejecuta antes de cada request.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Solo aplicar rate limiting a rutas de API
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Webhook de WhatsApp: no aplicar rate limit (Meta envía muchos eventos desde la misma IP)
  if (pathname.startsWith('/api/webhooks/whatsapp')) {
    return NextResponse.next();
  }

  // Determinar qué tipo de rate limit aplicar según la ruta
  let rateLimitKey: RateLimitKey = 'api';

  for (const [route, limitKey] of Object.entries(ROUTE_RATE_LIMITS)) {
    if (pathname.startsWith(route)) {
      rateLimitKey = limitKey;
      break;
    }
  }

  // Rutas públicas que no requieren autenticación
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/webhooks/whatsapp',  // Webhook de WhatsApp (verifica con hub.verify_token)
  ];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Intentar obtener userId del token si está disponible
  let userId: number | string | undefined;

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      const token = extractTokenFromHeader(authHeader);
      if (token) {
        // Usar la versión Edge-compatible de verificación
        const payload = await verifyAccessTokenEdge(token);
        if (payload?.userId) {
          userId = payload.userId;
        }
      }
    }
  } catch {
    // Token inválido o expirado
  }

  // ENFORCEMENT: Si es ruta protegida (no pública) y no hay userId válido, rechazar
  if (!isPublicRoute && !userId) {
    return NextResponse.json(
      { success: false, error: 'No autorizado: Token inválido o ausente' },
      { status: 401 }
    );
  }

  // Aplicar rate limiting
  const rateLimitResponse = await applyRateLimit(
    request,
    rateLimitKey,
    userId
  );

  // Si rate limiting retorna una respuesta, significa que se excedió el límite
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Continuar con la request normalmente
  return NextResponse.next();
}

/**
 * Configuración del middleware.
 * Define en qué rutas se ejecuta.
 */
export const config = {
  matcher: [
    /*
     * Match todas las rutas de API excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico (favicon)
     */
    '/api/:path*',
  ],
};


