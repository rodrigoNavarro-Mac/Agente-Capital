/**
 * =====================================================
 * API: Health Check y Circuit Breaker
 * =====================================================
 * Endpoint para verificar el estado del sistema y
 * gestionar el circuit breaker de la base de datos
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { getCircuitBreakerInfo, resetCircuitBreaker, getCircuitState } from '@/lib/circuit-breaker';
import { query } from '@/lib/postgres';
import { logger } from '@/lib/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos para resetear el circuit breaker
const ADMIN_ROLES = ['admin', 'ceo'];

/**
 * GET /api/health
 * Obtiene el estado del sistema y del circuit breaker
 */
export async function GET(_request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    const circuitBreakerInfo = getCircuitBreakerInfo();
    
    // Intentar una query simple para verificar la conexión a la BD
    let dbStatus = 'unknown';
    let dbError: string | null = null;
    
    try {
      await query('SELECT 1 as health_check');
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
      dbError = error instanceof Error ? error.message : String(error);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        circuitBreaker: {
          ...circuitBreakerInfo,
          // Calcular tiempo desde el último fallo si existe
          timeSinceLastFailure: circuitBreakerInfo.lastFailureTime 
            ? Date.now() - circuitBreakerInfo.lastFailureTime 
            : null,
        },
        database: {
          status: dbStatus,
          error: dbError,
        },
        environment: {
          nodeEnv: process.env.NODE_ENV,
          isVercel: !!process.env.VERCEL,
          hasPostgresUrl: !!process.env.POSTGRES_URL,
          hasDatabaseUrl: !!process.env.DATABASE_URL,
        },
      },
    });
  } catch (error) {
    logger.error('Error en health check', error, {}, 'health');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo estado del sistema',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/health/reset-circuit-breaker
 * Resetea el circuit breaker manualmente (solo admin/ceo)
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }

    // Verificar permisos (solo admin/ceo)
    if (!ADMIN_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para resetear el circuit breaker' },
        { status: 403 }
      );
    }

    const previousState = getCircuitState();
    resetCircuitBreaker();

    return NextResponse.json({
      success: true,
      data: {
        message: 'Circuit breaker reseteado exitosamente',
        previousState,
        currentState: getCircuitState(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error reseteando circuit breaker', error, {}, 'health');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error reseteando circuit breaker',
      },
      { status: 500 }
    );
  }
}

