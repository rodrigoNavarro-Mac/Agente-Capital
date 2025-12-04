/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LOGS API ENDPOINT
 * =====================================================
 * Endpoint para obtener logs de consultas y acciones
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueryLogs, getActionLogs } from '@/lib/postgres';
import type { QueryLog, ActionLog, APIResponse, ActionType, ResourceType, Zone } from '@/types/documents';

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
    const { searchParams } = new URL(request.url);
    
    const userIdParam = searchParams.get('userId');
    const zoneParam = searchParams.get('zone');
    const actionType = searchParams.get('actionType') as ActionType | null;
    const resourceType = searchParams.get('resourceType') as ResourceType | null;
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    console.log('📥 [API Logs] Parámetros recibidos:', {
      userId: userIdParam,
      zone: zoneParam,
      actionType,
      resourceType,
      limit,
      offset,
    });

    // Validar que zone sea un Zone válido
    const validZones: Zone[] = ['yucatan', 'puebla', 'quintana_roo', 'cdmx', 'jalisco', 'nuevo_leon'];
    const zone: Zone | undefined = zoneParam && validZones.includes(zoneParam as Zone) 
      ? (zoneParam as Zone) 
      : undefined;

    // Obtener query logs
    console.log('🔍 [API Logs] Obteniendo query logs...');
    const queryLogs = await getQueryLogs({
      userId: userIdParam ? parseInt(userIdParam) : undefined,
      zone: zone,
      limit: Math.floor(limit / 2), // Dividir entre queries y actions
      offset: Math.floor(offset / 2),
    });
    console.log(`✅ [API Logs] Query logs obtenidos: ${queryLogs.length}`);

    // Obtener action logs
    console.log('🔍 [API Logs] Obteniendo action logs...');
    const actionLogs = await getActionLogs({
      userId: userIdParam ? parseInt(userIdParam) : undefined,
      actionType: actionType || undefined,
      resourceType: resourceType || undefined,
      zone: zone,
      limit: Math.floor(limit / 2),
      offset: Math.floor(offset / 2),
    });
    console.log(`✅ [API Logs] Action logs obtenidos: ${actionLogs.length}`);

    const response = {
      success: true,
      data: {
        queries: queryLogs,
        actions: actionLogs,
      },
    };

    console.log('📤 [API Logs] Enviando respuesta:', {
      queriesCount: queryLogs.length,
      actionsCount: actionLogs.length,
      total: queryLogs.length + actionLogs.length,
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ [API Logs] Error obteniendo logs:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo logs',
      },
      { status: 500 }
    );
  }
}

