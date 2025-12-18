/**
 * =====================================================
 * API: Metas de Facturación de Comisiones
 * =====================================================
 * Endpoints para gestionar metas de facturación
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  getCommissionBillingTargets,
  upsertCommissionBillingTarget,
  deleteCommissionBillingTarget,
} from '@/lib/commission-db';
import type { APIResponse } from '@/types/documents';
import type { CommissionBillingTargetInput } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos para acceder a esta funcionalidad
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/billing-targets
 * Obtiene las metas de facturación para un año
 * Query params: ?year=2024
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
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { success: false, error: 'Año inválido' },
        { status: 400 }
      );
    }

    const targets = await getCommissionBillingTargets(year);

    return NextResponse.json({
      success: true,
      data: targets,
    });
  } catch (error) {
    logger.error('Error obteniendo metas de facturación', error, {}, 'commissions-billing-targets');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo metas de facturación',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commissions/billing-targets
 * Crea o actualiza una meta de facturación
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
    const { year, month, target_amount } = body;

    // Validaciones
    if (!year || !month || target_amount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: year, month, target_amount' },
        { status: 400 }
      );
    }

    if (year < 2000 || year > 2100) {
      return NextResponse.json(
        { success: false, error: 'Año inválido' },
        { status: 400 }
      );
    }

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: 'Mes inválido (debe estar entre 1 y 12)' },
        { status: 400 }
      );
    }

    if (target_amount < 0) {
      return NextResponse.json(
        { success: false, error: 'El monto objetivo debe ser mayor o igual a 0' },
        { status: 400 }
      );
    }

    const targetInput: CommissionBillingTargetInput = {
      year: parseInt(year, 10),
      month: parseInt(month, 10),
      target_amount: parseFloat(target_amount),
    };

    const target = await upsertCommissionBillingTarget(targetInput, payload.userId);

    return NextResponse.json({
      success: true,
      data: target,
    });
  } catch (error) {
    logger.error('Error guardando meta de facturación', error, {}, 'commissions-billing-targets');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error guardando meta de facturación',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/commissions/billing-targets
 * Elimina una meta de facturación
 * Query params: ?year=2024&month=1
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
    const year = parseInt(searchParams.get('year') || '', 10);
    const month = parseInt(searchParams.get('month') || '', 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { success: false, error: 'Año inválido' },
        { status: 400 }
      );
    }

    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: 'Mes inválido (debe estar entre 1 y 12)' },
        { status: 400 }
      );
    }

    const deleted = await deleteCommissionBillingTarget(year, month);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Meta de facturación no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Meta de facturación eliminada correctamente',
    });
  } catch (error) {
    logger.error('Error eliminando meta de facturación', error, {}, 'commissions-billing-targets');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error eliminando meta de facturación',
      },
      { status: 500 }
    );
  }
}

