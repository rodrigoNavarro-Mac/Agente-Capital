/**
 * =====================================================
 * API: Ajustes Manuales de Comisiones
 * =====================================================
 * Endpoints para gestionar ajustes manuales y auditoría
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import {
  createCommissionAdjustment,
  getCommissionAdjustments,
  getCommissionDistribution,
  updateCommissionDistribution,
} from '@/lib/commission-db';
import { logger } from '@/lib/logger';
import { validateRequest, commissionAdjustmentInputSchema } from '@/lib/validation';
import type { APIResponse } from '@/types/documents';
import type { CommissionAdjustmentInput } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos para hacer ajustes manuales
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/adjustments
 * Obtiene el historial de ajustes para una venta
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

    const adjustments = await getCommissionAdjustments(parseInt(saleId, 10));

    return NextResponse.json({
      success: true,
      data: adjustments,
    });
  } catch (error) {
    logger.error('Error obteniendo ajustes', error, {}, 'commissions-adjustments');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo ajustes',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commissions/adjustments
 * Crea un ajuste manual a una distribución
 * Body: { distribution_id, sale_id, adjustment_type, old_value, new_value, amount_impact, reason?, notes? }
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
    if (!payload || !payload.userId) {
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

    const rawBody = await request.json();
    const validation = validateRequest(commissionAdjustmentInputSchema, rawBody, 'commissions-adjustments');
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }
    
    const adjustmentInput = validation.data as CommissionAdjustmentInput;

    // Obtener distribución actual para obtener valores anteriores
    const distribution = await getCommissionDistribution(adjustmentInput.distribution_id);
    if (!distribution) {
      return NextResponse.json(
        { success: false, error: 'Distribución no encontrada' },
        { status: 404 }
      );
    }

    // Si no se proporciona old_value, usar el valor actual
    if (adjustmentInput.old_value === undefined || adjustmentInput.old_value === null) {
      if (adjustmentInput.adjustment_type === 'percent_change') {
        adjustmentInput.old_value = distribution.percent_assigned;
      } else if (adjustmentInput.adjustment_type === 'amount_change') {
        adjustmentInput.old_value = distribution.amount_calculated;
      }
    }

    // Si no se proporciona old_role_type, usar el actual
    if (!adjustmentInput.old_role_type) {
      adjustmentInput.old_role_type = distribution.role_type;
    }

    // Crear ajuste
    const adjustment = await createCommissionAdjustment(adjustmentInput, payload.userId);

    // Actualizar la distribución con el nuevo valor
    if (adjustmentInput.adjustment_type === 'percent_change') {
      await updateCommissionDistribution(
        adjustmentInput.distribution_id,
        adjustmentInput.new_value,
        adjustmentInput.amount_impact + distribution.amount_calculated
      );
    } else if (adjustmentInput.adjustment_type === 'amount_change') {
      // Mantener el porcentaje pero actualizar el monto
      await updateCommissionDistribution(
        adjustmentInput.distribution_id,
        distribution.percent_assigned,
        adjustmentInput.new_value
      );
    }

    return NextResponse.json({
      success: true,
      data: adjustment,
    });
  } catch (error) {
    logger.error('Error creando ajuste', error, {}, 'commissions-adjustments');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error creando ajuste',
      },
      { status: 500 }
    );
  }
}

