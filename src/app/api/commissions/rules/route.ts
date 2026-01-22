/**
 * =====================================================
 * API: Reglas de Comisiones
 * =====================================================
 * Endpoints para gestionar reglas de comisión por desarrollo
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import {
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
} from '@/lib/db/commission-db';
import { logger } from '@/lib/utils/logger';
import { validateRequest, commissionRuleInputSchema, updateCommissionRuleSchema } from '@/lib/utils/validation';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos para gestionar reglas
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/rules
 * Obtiene las reglas de comisión
 * Query params: ?desarrollo=xxx (opcional)
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
    const desarrollo = searchParams.get('desarrollo') || undefined;

    const rules = await getCommissionRules(desarrollo);

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    logger.error('Error obteniendo reglas de comisión', error, {}, 'commissions-rules');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo reglas de comisión',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commissions/rules
 * Crea una nueva regla de comisión
 * Body: CommissionRuleInput
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
    const validation = validateRequest(commissionRuleInputSchema, rawBody, 'commissions-rules');
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }
    
    const ruleInput = validation.data;

    const rule = await createCommissionRule(ruleInput, payload.userId);

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    logger.error('Error creando regla de comisión', error, {}, 'commissions-rules');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error creando regla de comisión',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/commissions/rules
 * Actualiza una regla de comisión existente
 * Body: { id: number, ...CommissionRuleInput }
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

    const rawBody = await request.json();
    const validation = validateRequest(updateCommissionRuleSchema, rawBody, 'commissions-rules');
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }
    
    const { id, ...ruleInput } = validation.data;

    const rule = await updateCommissionRule(id, ruleInput, payload.userId);

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    logger.error('Error actualizando regla de comisión', error, {}, 'commissions-rules');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando regla de comisión',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/commissions/rules
 * Elimina una regla de comisión
 * Query params: ?id=xxx
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
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID de regla es requerido' },
        { status: 400 }
      );
    }

    const deleted = await deleteCommissionRule(parseInt(id, 10));

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Regla no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Regla eliminada correctamente' },
    });
  } catch (error) {
    logger.error('Error eliminando regla de comisión', error, {}, 'commissions-rules');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error eliminando regla de comisión',
      },
      { status: 500 }
    );
  }
}




