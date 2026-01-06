/**
 * =====================================================
 * API: Comisiones por Socio
 * =====================================================
 * Endpoint para obtener las comisiones que se deben cobrar a cada socio
 * (100% de fase venta + fase posventa)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getCommissionsByPartner } from '@/lib/commission-db';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/partner-commissions
 * Obtiene las comisiones por socio
 * Query params: ?desarrollo=xxx&year=2024 (ambos opcionales)
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const desarrollo = searchParams.get('desarrollo');
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!, 10) : undefined;

    // Obtener comisiones por socio
    const commissions = await getCommissionsByPartner({
      desarrollo: desarrollo || undefined,
      year,
      month,
    });

    return NextResponse.json({
      success: true,
      data: commissions,
    });
  } catch (error) {
    logger.error('Error obteniendo comisiones por socio', error, {}, 'commissions-partner-commissions');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo comisiones por socio',
      },
      { status: 500 }
    );
  }
}

