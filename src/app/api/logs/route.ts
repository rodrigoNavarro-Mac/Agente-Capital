/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LOGS API ENDPOINT
 * =====================================================
 * Endpoint para obtener logs de consultas y acciones
 * Solo accesible para ADMIN y CEO
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueryLogs, getActionLogs, getUserById } from '@/lib/postgres';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import type { QueryLog, ActionLog, APIResponse, ActionType, ResourceType, Zone } from '@/types/documents';

// Forzar renderizado dinámico (esta ruta usa request.url que es dinámico)
export const dynamic = 'force-dynamic';

// Roles permitidos para acceder a LOGS (solo ADMIN y CEO)
const ALLOWED_ROLES = ['admin', 'ceo'];

// =====================================================
// ENDPOINT GET - OBTENER LOGS
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<{
  queries: QueryLog[];
  actions: ActionLog[];
}>>> {
  try {
    const logScope = 'api-logs';
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

    // 2. Verificar permisos (solo ADMIN y CEO)
    const user = await getUserById(payload.userId);
    if (!user || !user.role || !ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para acceder a los logs. Solo ADMIN y CEO pueden acceder.',
        },
        { status: 403 }
      );
    }

    // 3. Obtener parámetros de búsqueda
    const { searchParams } = new URL(request.url);
    
    const userIdParam = searchParams.get('userId');
    const zoneParam = searchParams.get('zone');
    const actionType = searchParams.get('actionType') as ActionType | null;
    const resourceType = searchParams.get('resourceType') as ResourceType | null;
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    logger.debug('Request params', {
      userId: userIdParam,
      zone: zoneParam,
      actionType,
      resourceType,
      limit,
      offset,
    }, logScope);

    // Validar que zone sea un Zone válido
    const validZones: Zone[] = ['yucatan', 'puebla', 'quintana_roo', 'cdmx', 'jalisco', 'nuevo_leon'];
    const zone: Zone | undefined = zoneParam && validZones.includes(zoneParam as Zone) 
      ? (zoneParam as Zone) 
      : undefined;

    // Obtener query logs
    logger.debug('Fetching query logs', undefined, logScope);
    const queryLogs = await getQueryLogs({
      userId: userIdParam ? parseInt(userIdParam) : undefined,
      zone: zone,
      limit: Math.floor(limit / 2), // Dividir entre queries y actions
      offset: Math.floor(offset / 2),
    });
    logger.debug('Query logs fetched', { count: queryLogs.length }, logScope);

    // Obtener action logs
    logger.debug('Fetching action logs', undefined, logScope);
    const actionLogs = await getActionLogs({
      userId: userIdParam ? parseInt(userIdParam) : undefined,
      actionType: actionType || undefined,
      resourceType: resourceType || undefined,
      zone: zone,
      limit: Math.floor(limit / 2),
      offset: Math.floor(offset / 2),
    });
    logger.debug('Action logs fetched', { count: actionLogs.length }, logScope);

    const response = {
      success: true,
      data: {
        queries: queryLogs,
        actions: actionLogs,
      },
    };

    logger.debug('Sending response', {
      queriesCount: queryLogs.length,
      actionsCount: actionLogs.length,
      total: queryLogs.length + actionLogs.length,
    }, logScope);

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Error fetching logs', error, undefined, 'api-logs');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo logs',
      },
      { status: 500 }
    );
  }
}

