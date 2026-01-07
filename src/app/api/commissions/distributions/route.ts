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
  updateCommissionDistributionPaymentStatus,
  getCommissionConfig,
  getCommissionGlobalConfigs,
  getApplicableCommissionRules,
  getCommissionRules,
  deleteCommissionDistributions,
  getRuleUnitsCountMap,
} from '@/lib/commission-db';
import { calculateCommission } from '@/lib/commission-calculator';
import { logger } from '@/lib/logger';
import { validateRequest, updateCommissionDistributionSchema } from '@/lib/validation';
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
    logger.error('Error obteniendo distribuciones', error, {}, 'commissions-distributions');
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

    const rawBody = await request.json();
    const validation = validateRequest(updateCommissionDistributionSchema, rawBody, 'commissions-distributions');
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }
    
    const { sale_id, commission_percent, recalculate } = validation.data;
    
    // Verificar si ya existen distribuciones calculadas para esta venta
    const existingDistributions = await getCommissionDistributions(sale_id);
    
    // Si ya existen distribuciones y no se solicita recalcular explícitamente,
    // devolver un error para proteger las distribuciones ya calculadas
    if (existingDistributions.length > 0 && !recalculate) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Ya existen distribuciones calculadas para esta venta. Use el parámetro recalculate=true para recalcular con la nueva configuración.',
          data: { existing_distributions: existingDistributions }
        },
        { status: 409 } // 409 Conflict - indica que hay un conflicto con el estado actual
      );
    }
    
    // Si se solicita recalcular, eliminar distribuciones existentes primero
    if (recalculate && existingDistributions.length > 0) {
      await deleteCommissionDistributions(sale_id);
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

    // Obtener configuración global
    const globalConfigs = await getCommissionGlobalConfigs();

    // Obtener reglas aplicables (si se cumplen las condiciones)
    // El conteo de unidades vendidas se calcula automáticamente para cada regla
    // basándose en el período de la regla (trimestre, mes, año)
    const applicableRules = await getApplicableCommissionRules(
      sale.desarrollo,
      sale.fecha_firma
    );
    
    // Obtener todas las reglas del desarrollo (para mostrar cuáles no se cumplieron)
    const allRules = await getCommissionRules(sale.desarrollo);

    // Obtener el conteo real de unidades vendidas en el período para todas las reglas
    // Esto corrige el error donde se mostraba 1/3 en lugar de 2/3 cuando hay 2 ventas en el trimestre
    const ruleUnitsCountMap = await getRuleUnitsCountMap(
      sale.desarrollo,
      sale.fecha_firma
    );

    // Calcular comisiones
    const calculation = calculateCommission(
      config,
      sale,
      globalConfigs,
      applicableRules,
      allRules,
      commission_percent || 100,
      ruleUnitsCountMap
    );

    // Guardar distribuciones
    const distributions = await createCommissionDistributions(calculation.distributions);

    // Actualizar estado de la venta (guardando también los porcentajes de fase usados)
    await updateCommissionSaleCalculation(
      sale.id,
      calculation.commission_total,
      calculation.commission_sale_phase,
      calculation.commission_post_sale_phase,
      config.phase_sale_percent,
      config.phase_post_sale_percent
    );

    return NextResponse.json({
      success: true,
      data: {
        ...calculation,
        distributions,
      },
    });
  } catch (error) {
    logger.error('Error calculando comisiones', error, {}, 'commissions-distributions');
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
 * DELETE /api/commissions/distributions
 * Elimina todas las distribuciones de comisión para una venta y resetea el estado
 * Query params: ?sale_id=xxx
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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

    await deleteCommissionDistributions(parseInt(saleId, 10));

    return NextResponse.json({
      success: true,
      data: { message: 'Distribuciones eliminadas correctamente' },
    });
  } catch (error) {
    logger.error('Error eliminando distribuciones', error, {}, 'commissions-distributions');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error eliminando distribuciones',
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
    logger.error('Error actualizando distribución', error, {}, 'commissions-distributions');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando distribución',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/commissions/distributions
 * Actualiza el estado de pago de una distribución de comisión
 * Body: { distribution_id: number, payment_status: 'pending' | 'paid' }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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
    const { distribution_id, payment_status } = body;

    if (!distribution_id || !payment_status) {
      return NextResponse.json(
        { success: false, error: 'distribution_id y payment_status son requeridos' },
        { status: 400 }
      );
    }

    if (payment_status !== 'pending' && payment_status !== 'paid') {
      return NextResponse.json(
        { success: false, error: 'payment_status debe ser "pending" o "paid"' },
        { status: 400 }
      );
    }

    const distribution = await updateCommissionDistributionPaymentStatus(
      distribution_id,
      payment_status
    );

    return NextResponse.json({
      success: true,
      data: distribution,
    });
  } catch (error) {
    logger.error('Error actualizando estado de pago de distribución', error, {}, 'commissions-distributions');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando estado de pago',
      },
      { status: 500 }
    );
  }
}

