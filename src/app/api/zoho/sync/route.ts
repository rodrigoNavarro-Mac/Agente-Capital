/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM SYNC API
 * =====================================================
 * Endpoint para sincronizar datos de Zoho CRM a la base de datos local
 * Solo accesible para ADMIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { getAllZohoLeads, getAllZohoDeals, getZohoNotesForRecords } from '@/lib/zoho-crm';
import { syncZohoLead, syncZohoDeal, syncZohoNote, logZohoSync } from '@/lib/postgres';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos para sincronizar
const ALLOWED_ROLES = ['admin'];

/**
 * Verifica si el usuario tiene permisos para sincronizar
 */
function checkSyncAccess(role?: string): boolean {
  if (!role) {
    return false;
  }
  return ALLOWED_ROLES.includes(role);
}

/**
 * POST /api/zoho/sync
 * Sincroniza datos de Zoho CRM a la base de datos local
 * 
 * Query params:
 * - type: 'leads' | 'deals' | 'full' (default: 'full')
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  const startTime = Date.now();
  let syncType: 'leads' | 'deals' | 'full' = 'full';
  let recordsSynced = 0;
  let recordsUpdated = 0;
  let recordsCreated = 0;
  let recordsFailed = 0;
  let errorMessage: string | undefined;

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

    // 2. Verificar permisos (solo admin)
    const hasAccess = checkSyncAccess(payload.role);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para sincronizar datos de Zoho CRM. Solo administradores pueden realizar esta acción.',
        },
        { status: 403 }
      );
    }

    // 3. Obtener parámetros
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');
    if (typeParam === 'leads' || typeParam === 'deals') {
      syncType = typeParam;
    }

    // 4. Sincronizar datos
    if (syncType === 'leads' || syncType === 'full') {
      try {
        console.log('🔄 Sincronizando leads de Zoho...');
        const leads = await getAllZohoLeads();
        
        for (const lead of leads) {
          try {
            const wasCreated = await syncZohoLead(lead);
            recordsSynced++;
            if (wasCreated) {
              recordsCreated++;
            } else {
              recordsUpdated++;
            }
            
            // Sincronizar notas del lead
            try {
              const notesMap = await getZohoNotesForRecords('Leads', [lead.id]);
              const notes = notesMap.get(lead.id) || [];
              for (const note of notes) {
                await syncZohoNote(note, 'Leads', lead.id);
              }
            } catch (noteError) {
              // No crítico si falla la sincronización de notas
              console.warn(`Advertencia: No se pudieron sincronizar notas del lead ${lead.id}:`, noteError);
            }
          } catch (error) {
            recordsFailed++;
            console.error(`Error sincronizando lead ${lead.id}:`, error);
          }
        }
        console.log(`✅ Sincronizados ${recordsSynced} leads`);
      } catch (error) {
        errorMessage = `Error sincronizando leads: ${error instanceof Error ? error.message : String(error)}`;
        console.error('❌', errorMessage);
      }
    }

    if (syncType === 'deals' || syncType === 'full') {
      try {
        console.log('🔄 Sincronizando deals de Zoho...');
        const deals = await getAllZohoDeals();
        
        for (const deal of deals) {
          try {
            const wasCreated = await syncZohoDeal(deal);
            recordsSynced++;
            if (wasCreated) {
              recordsCreated++;
            } else {
              recordsUpdated++;
            }
            
            // Sincronizar notas del deal
            try {
              const notesMap = await getZohoNotesForRecords('Deals', [deal.id]);
              const notes = notesMap.get(deal.id) || [];
              for (const note of notes) {
                await syncZohoNote(note, 'Deals', deal.id);
              }
            } catch (noteError) {
              // No crítico si falla la sincronización de notas
              console.warn(`Advertencia: No se pudieron sincronizar notas del deal ${deal.id}:`, noteError);
            }
          } catch (error) {
            recordsFailed++;
            console.error(`Error sincronizando deal ${deal.id}:`, error);
          }
        }
        console.log(`✅ Sincronizados ${recordsSynced} deals`);
      } catch (error) {
        errorMessage = errorMessage 
          ? `${errorMessage}; Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`
          : `Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`;
        console.error('❌', errorMessage);
      }
    }

    const durationMs = Date.now() - startTime;
    const status = recordsFailed === 0 ? 'success' : (recordsSynced > 0 ? 'partial' : 'error');

    // 5. Registrar log de sincronización
    await logZohoSync(syncType, status, {
      recordsSynced,
      recordsUpdated,
      recordsCreated,
      recordsFailed,
      errorMessage,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      data: {
        syncType,
        status,
        recordsSynced,
        recordsUpdated,
        recordsCreated,
        recordsFailed,
        durationMs,
        errorMessage,
      },
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido en sincronización';
    
    await logZohoSync(syncType, 'error', {
      recordsSynced,
      recordsUpdated,
      recordsCreated,
      recordsFailed,
      errorMessage: errorMsg,
      durationMs,
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/zoho/sync
 * Obtiene el estado de la última sincronización
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

    // 3. Obtener última sincronización desde la BD
    const { query } = await import('@/lib/postgres');
    const result = await query<{
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
      `SELECT sync_type, status, records_synced, records_updated, records_created, 
              records_failed, error_message, started_at, completed_at, duration_ms
       FROM zoho_sync_log
       ORDER BY started_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo estado de sincronización',
      },
      { status: 500 }
    );
  }
}

