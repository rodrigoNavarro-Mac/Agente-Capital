/**
 * =====================================================
 * API: Distribuciones de Comisiones
 * =====================================================
 * Endpoints para calcular y gestionar distribuciones de comisiones
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import {
  getCommissionSale,
  getCommissionDistributions,
  createCommissionDistributions,
  updateCommissionSaleCalculation,
  updateCommissionDistribution,
} from '@/lib/commission-db';
import { getCommissionConfig } from '@/lib/commission-db';
import { calculateCommission } from '@/lib/commission-calculator';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos para gestionar distribuciones
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/distributions
 * Obtiene las distribuciones de comisión para una venta
 * Query params: ?sale_id=xxx
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
    const saleId = searchParams.get('sale_id');

    if (!saleId) {
      return NextResponse.json(
        { success: false, error: 'sale_id es requerido' },
        { status: 400 }
      );
    }

    const distributions = await getCommissionDistributions(parseInt(saleId, 10));

    return NextResponse.json({
      success: true,
      data: distributions,
    });
  } catch (error) {
    console.error('Error obteniendo distribuciones:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo distribuciones',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commissions/distributions/calculate
 * Calcula las comisiones para una venta
 * Body: { sale_id: number, commission_percent?: number }
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

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sale_id, commission_percent } = body;

    if (!sale_id) {
      return NextResponse.json(
        { success: false, error: 'sale_id es requerido' },
        { status: 400 }
      );
    }

    // Obtener venta
    const sale = await getCommissionSale(sale_id);
    if (!sale) {
      return NextResponse.json(
        { success: false, error: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    // Obtener configuración del desarrollo
    const config = await getCommissionConfig(sale.desarrollo);
    if (!config) {
      return NextResponse.json(
        { success: false, error: `No hay configuración de comisiones para el desarrollo: ${sale.desarrollo}` },
        { status: 404 }
      );
    }

    // Calcular comisiones
    const calculation = calculateCommission(config, sale, commission_percent || 100);

    // Guardar distribuciones
    const distributions = await createCommissionDistributions(calculation.distributions);

    // Actualizar estado de la venta
    await updateCommissionSaleCalculation(
      sale.id,
      calculation.commission_total,
      calculation.commission_sale_phase,
      calculation.commission_post_sale_phase
    );

    return NextResponse.json({
      success: true,
      data: {
        ...calculation,
        distributions,
      },
    });
  } catch (error) {
    console.error('Error calculando comisiones:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error calculando comisiones',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/commissions/distributions
 * Actualiza una distribución de comisión (ajuste manual)
 * Body: { distribution_id: number, percent_assigned: number, amount_calculated: number }
 */
export async function PUT(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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

    const body = await request.json();
    const { distribution_id, percent_assigned, amount_calculated } = body;

    if (!distribution_id || percent_assigned === undefined || amount_calculated === undefined) {
      return NextResponse.json(
        { success: false, error: 'distribution_id, percent_assigned y amount_calculated son requeridos' },
        { status: 400 }
      );
    }

    const distribution = await updateCommissionDistribution(
      distribution_id,
      percent_assigned,
      amount_calculated
    );

    return NextResponse.json({
      success: true,
      data: distribution,
    });
  } catch (error) {
    console.error('Error actualizando distribución:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando distribución',
      },
      { status: 500 }
    );
  }
}

