/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM SYNC LOGS API
 * =====================================================
 * Endpoint para obtener logs de sincronización de Zoho CRM
 * Solo accesible para ADMIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { query } from '@/lib/postgres';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos
const ALLOWED_ROLES = ['admin'];

/**
 * Verifica si el usuario tiene permisos
 */
function checkSyncAccess(role?: string): boolean {
  if (!role) {
    return false;
  }
  return ALLOWED_ROLES.includes(role);
}

/**
 * GET /api/zoho/sync/logs
 * Obtiene los logs de sincronización
 * 
 * Query params:
 * - limit: número de registros (default: 50, max: 200)
 * - offset: offset para paginación (default: 0)
 * - type: filtrar por tipo ('leads', 'deals', 'full')
 * - status: filtrar por estado ('success', 'error', 'partial')
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

    // 2. Verificar permisos
    const hasAccess = checkSyncAccess(payload.role);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para ver logs de sincronización.',
        },
        { status: 403 }
      );
    }

    // 3. Obtener parámetros
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const typeFilter = searchParams.get('type');
    const statusFilter = searchParams.get('status');

    // 4. Construir query
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (typeFilter) {
      whereConditions.push(`sync_type = $${paramIndex}`);
      params.push(typeFilter);
      paramIndex++;
    }

    if (statusFilter) {
      whereConditions.push(`status = $${paramIndex}`);
      params.push(statusFilter);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // 5. Obtener logs
    const result = await query<{
      id: number;
      sync_type: string;
      status: string;
      records_synced: number;
      records_updated: number;
      records_created: number;
      records_failed: number;
      error_message: string | null;
      started_at: Date;
      completed_at: Date | null;
      duration_ms: number | null;
    }>(
      `SELECT id, sync_type, status, records_synced, records_updated, records_created,
              records_failed, error_message, started_at, completed_at, duration_ms
       FROM zoho_sync_log
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // 6. Obtener total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM zoho_sync_log ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    return NextResponse.json({
      success: true,
      data: {
        logs: result.rows,
        total,
        limit,
        offset,
      },
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo logs de sincronización',
      },
      { status: 500 }
    );
  }
}



