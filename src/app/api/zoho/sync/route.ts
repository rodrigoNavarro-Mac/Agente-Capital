/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM SYNC API
 * =====================================================
 * Endpoint para sincronizar datos de Zoho CRM a la base de datos local
 * Solo accesible para ADMIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getAllZohoLeads, getAllZohoDeals, getAllZohoActivities, getZohoNotesForRecords, getZohoRecordTimeline, parseStageTransitionsFromTimeline } from '@/lib/services/zoho-crm';
import { syncZohoLead, syncZohoDeal, syncZohoNote, syncZohoActivity, logZohoSync, deleteZohoLeadsNotInZoho, deleteZohoDealsNotInZoho, query, getRecordsWithoutStageHistory, bulkInsertStageHistory, getLastModifiedTime } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos máximo para sincronización

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
 * Procesa un arreglo de elementos en chunks paralelos.
 *
 * Por qué: hacer 2000 awaits secuenciales (uno a uno) es demasiado lento
 * para el límite de 300s de Vercel. En cambio, procesamos N elementos a la vez
 * (concurrency), avanzando chunk por chunk. Esto baja el tiempo total
 * dramáticamente sin saturar a Zoho ni a la base de datos.
 *
 * @param items Lista de elementos a procesar
 * @param concurrency Cuántos procesar en paralelo dentro de cada chunk
 * @param handler Función async que procesa un elemento
 */
async function processInChunks<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }>> {
  const results: Array<
    { status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }
  > = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    // Promise.allSettled NO falla si un elemento individual lanza error.
    // Así no perdemos los resultados exitosos por culpa de uno malo.
    const chunkResults = await Promise.allSettled(
      chunk.map((item, idx) => handler(item, i + idx))
    );
    results.push(...chunkResults);
  }

  return results;
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
  let recordsDeleted = 0;
  let errorMessage: string | undefined;
  const logScope = 'zoho-sync';

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
    // Backfill de stage history es caro (~30-60s de delays a Zoho). Por defecto
    // NO se incluye en el sync regular para evitar timeouts. Para correrlo,
    // hay que llamar explícitamente con ?backfill=true
    const includeBackfill = searchParams.get('backfill') === 'true';

    // Sync incremental por defecto: solo trae registros con Modified_Time
    // posterior al MAX(modified_time) que ya tenemos en BD. Esto evita
    // que el endpoint exceda los 300s de Vercel cuando hay miles de registros.
    //
    // Si el cliente pasa ?force=true, hacemos full sync (sin If-Modified-Since)
    // y además ejecutamos los deletes (porque tenemos la lista completa).
    const forceFull = searchParams.get('force') === 'true';

    // 4. Sincronizar datos
    let zohoLeadIds: string[] = [];
    let zohoDealIds: string[] = [];
    
    if (syncType === 'leads' || syncType === 'full') {
      try {
        // En modo incremental, leemos el último Modified_Time que tenemos
        // sincronizado y se lo pasamos a Zoho como If-Modified-Since.
        // Zoho solo nos devolverá los leads que cambiaron desde entonces.
        const leadsSince = forceFull ? null : await getLastModifiedTime('zoho_leads');
        logger.info('Starting Zoho leads sync', {
          syncType,
          mode: leadsSince ? 'incremental' : 'full',
          since: leadsSince?.toISOString(),
        }, logScope);
        let leads;
        try {
          leads = await getAllZohoLeads(leadsSince ?? undefined);
        } catch (fetchError) {
          // Detectar errores de red temprano
          const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
          const isNetworkError = errorMsg.includes('ENOTFOUND') || 
                                errorMsg.includes('ETIMEDOUT') || 
                                errorMsg.includes('ECONNREFUSED') ||
                                errorMsg.includes('fetch failed') ||
                                errorMsg.includes('network');
          
          if (isNetworkError) {
            errorMessage = `Error de conexión con Zoho: No se pudo conectar a accounts.zoho.com. Verifica tu conexión a internet.`;
            logger.error('Network error connecting to Zoho', fetchError, { errorMessage }, logScope);
            throw new Error(errorMessage);
          }
          throw fetchError; // Re-lanzar otros errores
        }
        zohoLeadIds = leads.map(lead => lead.id);
        logger.debug('Leads fetched from Zoho', { count: leads.length }, logScope);

        // Sincronizar leads en chunks paralelos.
        // Antes: 2000 awaits secuenciales = ~2000 * 50ms = 100s solo en BD.
        // Ahora: chunks de 15 en paralelo = ~7s para 2000 registros.
        const leadResults = await processInChunks(leads, 15, async (lead) => {
          return await syncZohoLead(lead);
        });

        leadResults.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            recordsSynced++;
            if (result.value === true) {
              recordsCreated++;
            } else if (result.value === false) {
              recordsUpdated++;
            }
            // value === null significa "sin cambios", no se cuenta
          } else {
            recordsFailed++;
            logger.error('Error syncing lead', result.reason, { leadId: leads[idx]?.id }, logScope);
          }
        });

        logger.info('Leads sync completed', {
          recordsSynced,
          recordsCreated,
          recordsUpdated,
          recordsFailed,
        }, logScope);

        // Sincronizar notas SOLO de los leads que vinieron en esta tanda.
        // En sync incremental esto es muy barato (solo decenas de IDs en lugar
        // de miles). En full sync sigue siendo manejable porque las notas se
        // bajan en lotes paralelos.
        if (zohoLeadIds.length > 0) {
          try {
            logger.debug('Fetching notes for leads in batch', { count: zohoLeadIds.length }, logScope);
            const notesMap = await getZohoNotesForRecords('Leads', zohoLeadIds);

            // Aplanar el mapa en una lista de "tareas" de sync de nota
            const noteTasks: Array<{ note: any; leadId: string }> = [];
            notesMap.forEach((notes, leadId) => {
              notes.forEach(note => noteTasks.push({ note, leadId }));
            });

            if (noteTasks.length > 0) {
              logger.debug('Syncing lead notes in parallel chunks', { count: noteTasks.length }, logScope);
              // Chunks de 20 escrituras en paralelo a Postgres (seguro y rápido)
              await processInChunks(noteTasks, 20, async ({ note, leadId }) => {
                return await syncZohoNote(note, 'Leads', leadId);
              });
            }
          } catch (notesError) {
            // No crítico: las notas son secundarias al sync de leads
            logger.warn('Failed batch syncing notes for leads (non-critical)', undefined, logScope);
            logger.error('Notes batch sync error', notesError, undefined, logScope);
          }
        }

        // Eliminar leads que ya no existen en Zoho.
        // SOLO en modo force=true: en sync incremental NO recibimos la lista
        // completa de leads, así que no podemos saber cuáles fueron borrados
        // en Zoho. Hacer el delete con una lista parcial borraría leads válidos.
        if (forceFull) {
          try {
            logger.debug('Checking for deleted leads in Zoho', { count: zohoLeadIds.length }, logScope);
            const deletedCount = await deleteZohoLeadsNotInZoho(zohoLeadIds);
            recordsDeleted += deletedCount;
            if (deletedCount > 0) {
              logger.info('Deleted leads not present in Zoho', { deletedCount }, logScope);
            }
          } catch (deleteError) {
            logger.warn('Failed deleting leads not present in Zoho', undefined, logScope);
            logger.error('Delete leads error', deleteError, undefined, logScope);
          }
        }
      } catch (error) {
        errorMessage = `Error sincronizando leads: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Leads sync failed', error, { errorMessage }, logScope);
      }
    }

    if (syncType === 'deals' || syncType === 'full') {
      try {
        const dealsSince = forceFull ? null : await getLastModifiedTime('zoho_deals');
        logger.info('Starting Zoho deals sync', {
          syncType,
          mode: dealsSince ? 'incremental' : 'full',
          since: dealsSince?.toISOString(),
        }, logScope);
        let deals;
        try {
          deals = await getAllZohoDeals(dealsSince ?? undefined);
        } catch (fetchError) {
          // Detectar errores de red temprano
          const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
          const isNetworkError = errorMsg.includes('ENOTFOUND') || 
                                errorMsg.includes('ETIMEDOUT') || 
                                errorMsg.includes('ECONNREFUSED') ||
                                errorMsg.includes('fetch failed') ||
                                errorMsg.includes('network');
          
          if (isNetworkError) {
            errorMessage = errorMessage 
              ? `${errorMessage}; Error de conexión con Zoho: No se pudo conectar a accounts.zoho.com. Verifica tu conexión a internet.`
              : `Error de conexión con Zoho: No se pudo conectar a accounts.zoho.com. Verifica tu conexión a internet.`;
            logger.error('Network error connecting to Zoho', fetchError, { errorMessage }, logScope);
            throw new Error(errorMessage);
          }
          throw fetchError; // Re-lanzar otros errores
        }
        zohoDealIds = deals.map(deal => deal.id);
        logger.debug('Deals fetched from Zoho', { count: deals.length }, logScope);

        // Mismo patrón que para leads: chunks paralelos + notas en batch
        const dealResults = await processInChunks(deals, 15, async (deal) => {
          return await syncZohoDeal(deal);
        });

        dealResults.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            recordsSynced++;
            if (result.value === true) {
              recordsCreated++;
            } else if (result.value === false) {
              recordsUpdated++;
            }
          } else {
            recordsFailed++;
            logger.error('Error syncing deal', result.reason, { dealId: deals[idx]?.id }, logScope);
          }
        });

        logger.info('Deals sync completed', {
          recordsSynced,
          recordsCreated,
          recordsUpdated,
          recordsFailed,
        }, logScope);

        // Notas de deals SOLO de los que vinieron en esta tanda (idem leads)
        if (zohoDealIds.length > 0) {
          try {
            logger.debug('Fetching notes for deals in batch', { count: zohoDealIds.length }, logScope);
            const notesMap = await getZohoNotesForRecords('Deals', zohoDealIds);

            const noteTasks: Array<{ note: any; dealId: string }> = [];
            notesMap.forEach((notes, dealId) => {
              notes.forEach(note => noteTasks.push({ note, dealId }));
            });

            if (noteTasks.length > 0) {
              logger.debug('Syncing deal notes in parallel chunks', { count: noteTasks.length }, logScope);
              await processInChunks(noteTasks, 20, async ({ note, dealId }) => {
                return await syncZohoNote(note, 'Deals', dealId);
              });
            }
          } catch (notesError) {
            logger.warn('Failed batch syncing notes for deals (non-critical)', undefined, logScope);
            logger.error('Notes batch sync error', notesError, undefined, logScope);
          }
        }

        // Deletes solo en force=true (igual razonamiento que para leads)
        if (forceFull) {
          try {
            logger.debug('Checking for deleted deals in Zoho', { count: zohoDealIds.length }, logScope);
            const deletedCount = await deleteZohoDealsNotInZoho(zohoDealIds);
            recordsDeleted += deletedCount;
            if (deletedCount > 0) {
              logger.info('Deleted deals not present in Zoho', { deletedCount }, logScope);
            }
          } catch (deleteError) {
            logger.warn('Failed deleting deals not present in Zoho', undefined, logScope);
            logger.error('Delete deals error', deleteError, undefined, logScope);
          }
        }
      } catch (error) {
        errorMessage = errorMessage 
          ? `${errorMessage}; Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`
          : `Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Deals sync failed', error, { errorMessage }, logScope);
      }
    }

    // Backfill incremental de historial de etapas.
    // Es caro porque hace ~75 llamadas a Zoho con delays de 450ms (rate limit).
    // Solo se ejecuta si el cliente pide explícitamente ?backfill=true.
    if (syncType === 'full' && includeBackfill) {
      try {
        logger.info('Starting stage history backfill', {}, logScope);

        const [leadIds, dealIds] = await Promise.all([
          getRecordsWithoutStageHistory('lead', 40),
          getRecordsWithoutStageHistory('deal', 35),
        ]);

        logger.debug('Records pending stage history backfill', {
          leads: leadIds.length, deals: dealIds.length,
        }, logScope);

        let backfillInserted = 0;
        const DELAY_MS = 450; // ~130 req/min — dentro del límite Zoho

        // Backfill leads
        for (const leadId of leadIds) {
          try {
            const timeline = await getZohoRecordTimeline('Leads', leadId);
            const transitions = parseStageTransitionsFromTimeline(timeline, 'Lead_Status');
            // Enriquecer con desarrollo/owner desde BD
            const meta = await query<{ desarrollo: string | null; owner_name: string | null }>(
              'SELECT desarrollo, owner_name FROM zoho_leads WHERE zoho_id = $1', [leadId]
            );
            const { desarrollo, owner_name } = meta.rows[0] ?? {};
            const entries = transitions.map(t => ({
              record_type: 'lead' as const,
              record_id: leadId,
              desarrollo: desarrollo ?? undefined,
              owner_name: owner_name ?? undefined,
              from_stage: t.from_stage,
              to_stage: t.to_stage,
              changed_at: t.changed_at,
            }));
            // Si el timeline no devolvió transiciones, insertar al menos el estado actual
            if (entries.length === 0) {
              const cur = await query<{ lead_status: string | null; created_time: Date | null }>(
                'SELECT lead_status, created_time FROM zoho_leads WHERE zoho_id = $1', [leadId]
              );
              if (cur.rows[0]?.lead_status) {
                entries.push({
                  record_type: 'lead',
                  record_id: leadId,
                  desarrollo: desarrollo ?? undefined,
                  owner_name: owner_name ?? undefined,
                  from_stage: null,
                  to_stage: cur.rows[0].lead_status,
                  changed_at: cur.rows[0].created_time ?? new Date(),
                });
              }
            }
            backfillInserted += await bulkInsertStageHistory(entries);
          } catch {
            logger.warn('Backfill failed for lead', { leadId }, logScope);
          }
          await new Promise(r => setTimeout(r, DELAY_MS));
        }

        // Backfill deals
        for (const dealId of dealIds) {
          try {
            const timeline = await getZohoRecordTimeline('Deals', dealId);
            const transitions = parseStageTransitionsFromTimeline(timeline, 'Stage');
            const meta = await query<{ desarrollo: string | null; owner_name: string | null }>(
              'SELECT desarrollo, owner_name FROM zoho_deals WHERE zoho_id = $1', [dealId]
            );
            const { desarrollo, owner_name } = meta.rows[0] ?? {};
            const entries = transitions.map(t => ({
              record_type: 'deal' as const,
              record_id: dealId,
              desarrollo: desarrollo ?? undefined,
              owner_name: owner_name ?? undefined,
              from_stage: t.from_stage,
              to_stage: t.to_stage,
              changed_at: t.changed_at,
            }));
            if (entries.length === 0) {
              const cur = await query<{ stage: string | null; created_time: Date | null }>(
                'SELECT stage, created_time FROM zoho_deals WHERE zoho_id = $1', [dealId]
              );
              if (cur.rows[0]?.stage) {
                entries.push({
                  record_type: 'deal',
                  record_id: dealId,
                  desarrollo: desarrollo ?? undefined,
                  owner_name: owner_name ?? undefined,
                  from_stage: null,
                  to_stage: cur.rows[0].stage,
                  changed_at: cur.rows[0].created_time ?? new Date(),
                });
              }
            }
            backfillInserted += await bulkInsertStageHistory(entries);
          } catch {
            logger.warn('Backfill failed for deal', { dealId }, logScope);
          }
          await new Promise(r => setTimeout(r, DELAY_MS));
        }

        logger.info('Stage history backfill completed', {
          leadsProcessed: leadIds.length,
          dealsProcessed: dealIds.length,
          rowsInserted: backfillInserted,
        }, logScope);
      } catch (backfillError) {
        logger.warn('Stage history backfill failed (non-critical)', undefined, logScope);
        logger.error('Backfill error', backfillError, {}, logScope);
      }
    }

    // Sincronizar actividades (solo en sync full)
    if (syncType === 'full') {
      try {
        // Igual que con leads/deals: solo bajamos actividades modificadas
        // desde el último sync (a menos que force=true).
        const activitiesSince = forceFull ? null : await getLastModifiedTime('zoho_activities');
        logger.info('Starting Zoho activities sync', {
          mode: activitiesSince ? 'incremental' : 'full',
          since: activitiesSince?.toISOString(),
        }, logScope);
        const activities = await getAllZohoActivities('all', activitiesSince ?? undefined);

        // Pre-cargar mapas zoho_id -> desarrollo en DOS queries totales.
        // Antes: 1 query por actividad (problema N+1). Para 1000 actividades
        // serían 1000 round-trips a la BD; ahora son solo 2.
        const [leadsDesarrolloRes, dealsDesarrolloRes] = await Promise.all([
          query<{ zoho_id: string; desarrollo: string | null }>(
            'SELECT zoho_id, desarrollo FROM zoho_leads WHERE desarrollo IS NOT NULL'
          ),
          query<{ zoho_id: string; desarrollo: string | null }>(
            'SELECT zoho_id, desarrollo FROM zoho_deals WHERE desarrollo IS NOT NULL'
          ),
        ]);

        const leadDesarrolloMap = new Map<string, string>();
        leadsDesarrolloRes.rows.forEach(r => {
          if (r.desarrollo) leadDesarrolloMap.set(r.zoho_id, r.desarrollo);
        });
        const dealDesarrolloMap = new Map<string, string>();
        dealsDesarrolloRes.rows.forEach(r => {
          if (r.desarrollo) dealDesarrolloMap.set(r.zoho_id, r.desarrollo);
        });

        const activityResults = await processInChunks(activities, 20, async (activity) => {
          const leadId = activity.Who_Id?.id;
          const dealId = activity.What_Id?.id;
          let actDesarrollo: string | undefined;
          if (leadId) {
            actDesarrollo = leadDesarrolloMap.get(leadId);
          } else if (dealId) {
            actDesarrollo = dealDesarrolloMap.get(dealId);
          }
          return await syncZohoActivity(activity, leadId, dealId, actDesarrollo);
        });

        const activitiesSynced = activityResults.filter(r => r.status === 'fulfilled').length;
        const activitiesFailed = activityResults.filter(r => r.status === 'rejected').length;
        if (activitiesFailed > 0) {
          logger.warn('Some activities failed to sync', { activitiesFailed }, logScope);
        }
        logger.info('Activities sync completed', { activitiesSynced, activitiesFailed }, logScope);
      } catch (actSyncError) {
        // No-crítico: no fallar el sync general por actividades
        logger.warn('Activities sync failed (non-critical)', undefined, logScope);
        logger.error('Activities sync error', actSyncError, {}, logScope);
      }
    }

    const durationMs = Date.now() - startTime;
    const durationSeconds = Math.round(durationMs / 1000);
    const status = recordsFailed === 0 ? 'success' : (recordsSynced > 0 ? 'partial' : 'error');

    logger.info('Zoho sync summary', {
      syncType,
      status,
      recordsSynced,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      recordsDeleted,
      durationSeconds,
      durationMs,
    }, logScope);

    // 5. Registrar log de sincronización
    await logZohoSync(syncType, status, {
      recordsSynced,
      recordsUpdated,
      recordsCreated,
      recordsFailed,
      recordsDeleted,
      errorMessage,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      data: {
        syncType,
        status,
        // Indica al frontend si esta corrida fue incremental o full
        mode: forceFull ? 'full' : 'incremental',
        recordsSynced,
        recordsUpdated,
        recordsCreated,
        recordsFailed,
        recordsDeleted,
        durationMs,
        durationSeconds,
        errorMessage,
      },
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido en sincronización';
    
    // Intentar registrar el log, pero no fallar si no se puede (circuit breaker abierto, etc.)
    try {
      await logZohoSync(syncType, 'error', {
        recordsSynced,
        recordsUpdated,
        recordsCreated,
        recordsFailed,
        recordsDeleted,
        errorMessage: errorMsg,
        durationMs,
      });
    } catch (logError) {
      // No fallar si no se puede registrar el log
      logger.warn(
        'Could not log sync error (non-critical)', 
        { 
          error: logError instanceof Error ? logError.message : String(logError),
          syncType 
        }, 
        logScope
      );
    }

    logger.error('Unhandled error during Zoho sync', error, { syncType, durationMs }, logScope);
    
    // Determinar código de estado HTTP apropiado
    const isNetworkError = errorMsg.includes('ENOTFOUND') || 
                          errorMsg.includes('ETIMEDOUT') || 
                          errorMsg.includes('ECONNREFUSED') ||
                          errorMsg.includes('fetch failed') ||
                          errorMsg.includes('conexión');
    const statusCode = isNetworkError ? 503 : 500; // 503 Service Unavailable para errores de red
    
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: statusCode }
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
    const { query } = await import('@/lib/db/postgres');
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





