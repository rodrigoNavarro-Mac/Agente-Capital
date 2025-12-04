/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM PIPELINES API
 * =====================================================
 * Endpoint para obtener pipelines de ZOHO CRM
 * Solo accesible para admin, ceo y sales_manager
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { getUserById } from '@/lib/postgres';
import { getZohoPipelines } from '@/lib/zoho-crm';
import type { APIResponse } from '@/types/documents';

// Roles permitidos para acceder a ZOHO CRM
const ALLOWED_ROLES = ['admin', 'ceo', 'sales_manager'];

/**
 * Verifica si el usuario tiene permisos para acceder a ZOHO CRM
 */
async function checkZohoAccess(userId: number): Promise<boolean> {
  try {
    const user = await getUserById(userId);
    if (!user || !user.role) {
      return false;
    }
    return ALLOWED_ROLES.includes(user.role);
  } catch (error) {
    console.error('Error verificando acceso a ZOHO:', error);
    return false;
  }
}

/**
 * GET /api/zoho/pipelines
 * Obtiene pipelines de ZOHO CRM
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // 1. Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'No autorizado',
        },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token inválido o expirado',
        },
        { status: 401 }
      );
    }

    // 2. Verificar permisos (solo admin, ceo, sales_manager)
    const hasAccess = await checkZohoAccess(payload.userId);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para acceder a ZOHO CRM. Solo gerentes, CEO y administradores pueden acceder.',
        },
        { status: 403 }
      );
    }

    // 3. Obtener pipelines de ZOHO CRM
    const pipelinesResponse = await getZohoPipelines();

    return NextResponse.json({
      success: true,
      data: pipelinesResponse,
    });

  } catch (error) {
    console.error('❌ Error obteniendo pipelines de ZOHO:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error 
          ? error.message 
          : 'Error obteniendo pipelines de ZOHO CRM',
      },
      { status: 500 }
    );
  }
}

