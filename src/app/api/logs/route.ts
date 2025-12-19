/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LOGS API ENDPOINT
 * =====================================================
 * Endpoint para obtener logs de consultas y acciones
 * - ADMIN y CEO pueden ver todos los logs
 * - Usuarios normales solo pueden ver sus propios logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueryLogs, getActionLogs, getUserById } from '@/lib/postgres';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import type { QueryLog, ActionLog, APIResponse, ActionType, ResourceType, Zone } from '@/types/documents';

// Forzar renderizado din?mico (esta ruta usa request.url que es din?mico)
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
    // 1. Verificar autenticaci?n
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
          error: 'Token inv?lido o expirado',
        },
        { status: 401 }
      );
    }

    // 2. Obtener par?metros de b?squeda
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const zoneParam = searchParams.get('zone');
    const actionType = searchParams.get('actionType') as ActionType | null;
    const resourceType = searchParams.get('resourceType') as ResourceType | null;
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    // 3. Verificar permisos
    const user = await getUserById(payload.userId);
    if (!user || !user.role) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario no encontrado',
        },
        { status: 403 }
      );
    }

    // Verificar si el usuario es admin o CEO
    const isAdminOrCEO = ALLOWED_ROLES.includes(user.role);
    
    // Si no es admin/CEO, solo puede ver sus propios logs
    if (!isAdminOrCEO) {
      // Si no se especific? userId, usar el userId del token
      // Si se especific? userId, debe coincidir con el userId del token
      if (userIdParam) {
        if (parseInt(userIdParam) !== payload.userId) {
          return NextResponse.json(
            {
              success: false,
              error: 'Solo puedes ver tus propios logs. Los administradores pueden ver todos los logs.',
            },
            { status: 403 }
          );
        }
      }
      // Si no se especific? userId, forzar el userId del token m?s adelante
    }

    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    // Determinar el userId que se usará para las consultas
    const finalUserId = !isAdminOrCEO && !userIdParam 
      ? payload.userId 
      : (userIdParam ? parseInt(userIdParam) : undefined);
    
    logger.debug('Request params', {
      userId: finalUserId,
      zone: zoneParam,
      actionType,
      resourceType,
      limit,
      offset,
      isAdminOrCEO,
    }, logScope);

    // Validar que zone sea un Zone v?lido
    const validZones: Zone[] = ['yucatan', 'puebla', 'quintana_roo', 'cdmx', 'jalisco', 'nuevo_leon'];
    const zone: Zone | undefined = zoneParam && validZones.includes(zoneParam as Zone) 
      ? (zoneParam as Zone) 
      : undefined;

    // Obtener query logs
    logger.debug('Fetching query logs', undefined, logScope);
    const queryLogs = await getQueryLogs({
      userId: finalUserId,
      zone: zone,
      limit: Math.floor(limit / 2), // Dividir entre queries y actions
      offset: Math.floor(offset / 2),
    });
    logger.debug('Query logs fetched', { count: queryLogs.length }, logScope);

    // Obtener action logs
    logger.debug('Fetching action logs', undefined, logScope);
    const actionLogs = await getActionLogs({
      userId: finalUserId,
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

