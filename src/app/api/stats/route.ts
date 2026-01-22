/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - STATS API ENDPOINT
 * =====================================================
 * Endpoint para obtener estadísticas del dashboard
 */

import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/db/postgres';
import { memoryCache } from '@/lib/infrastructure/memory-cache';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER ESTADÍSTICAS
// =====================================================

export async function GET(): Promise<NextResponse<APIResponse<{
  totalDocuments: number;
  totalQueriesThisMonth: number;
  averageResponseTime: number;
  averageRating: number;
}>>> {
  try {
    // Usar caché en memoria para mejorar rendimiento
    const stats = await memoryCache.getCachedStats(() => getDashboardStats());

    // Configurar headers de caché HTTP
    const response = NextResponse.json({
      success: true,
      data: stats,
    });

    // Cachear en el cliente por 1 minuto (estadísticas cambian frecuentemente)
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

    return response;

  } catch (error) {
    logger.error('Error obteniendo estadísticas', error, {}, 'stats');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo estadísticas',
      },
      { status: 500 }
    );
  }
}




