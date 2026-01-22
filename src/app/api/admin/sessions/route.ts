/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ADMIN SESSIONS ENDPOINT
 * =====================================================
 * Endpoint para que administradores vean sesiones y visitas de usuarios
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { 
  getUserSessionsWithInfo, 
  getPageVisits, 
  getUserActivitySummary 
} from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos para acceder a esta información
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/admin/sessions
 * Obtiene sesiones y visitas de usuarios (solo para admins)
 * Query params:
 *   - userId?: number - Filtrar por usuario específico
 *   - activeOnly?: boolean - Solo sesiones activas
 *   - limit?: number - Límite de resultados
 *   - offset?: number - Offset para paginación
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<{
  sessions: Array<{
    id: number;
    user_id: number;
    user_name: string;
    user_email: string;
    user_role: string;
    ip_address?: string;
    user_agent?: string;
    session_started_at: Date;
    session_last_used: Date;
    session_expires_at: Date;
    session_status: 'active' | 'expired';
    pages_visited_count: number;
  }>;
  activitySummary: Array<{
    user_id: number;
    user_name: string;
    user_email: string;
    user_role: string;
    total_sessions: number;
    total_page_visits: number;
    modules_visited: number;
    last_session_start: Date;
    last_page_visit: Date;
    modules_list: string;
  }>;
  pageVisits: Array<{
    id: number;
    user_id: number;
    session_id?: number;
    page_path: string;
    page_name?: string;
    module_name?: string;
    ip_address?: string;
    user_agent?: string;
    visited_at: Date;
    duration_seconds?: number;
  }>;
}>>> {
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

    // Verificar permisos (solo admin y ceo)
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a esta información' },
        { status: 403 }
      );
    }

    // Obtener parámetros de consulta
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') ? parseInt(searchParams.get('userId')!, 10) : undefined;
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;
    const includeVisits = searchParams.get('includeVisits') !== 'false'; // Por defecto incluir visitas

    // Obtener sesiones
    const sessions = await getUserSessionsWithInfo({
      userId,
      activeOnly,
      limit,
      offset,
    });

    // Obtener resumen de actividad
    const activitySummary = await getUserActivitySummary({
      userId,
    });

    // Obtener visitas a páginas si se solicita
    let pageVisits: Awaited<ReturnType<typeof getPageVisits>> = [];
    if (includeVisits) {
      pageVisits = await getPageVisits({
        userId,
        limit: 100, // Límite razonable para visitas
        offset: 0,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessions,
        activitySummary,
        pageVisits,
      },
    });
  } catch (error) {
    logger.error('Error obteniendo sesiones y visitas', error, {}, 'admin-sessions');
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener información de sesiones',
      },
      { status: 500 }
    );
  }
}









