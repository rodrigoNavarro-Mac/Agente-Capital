/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM SYNC CRON
 * =====================================================
 * Endpoint para sincronizar datos de Zoho CRM automáticamente
 * Se ejecuta automáticamente mediante cron job
 * 
 * Protegido con secret key para evitar ejecuciones no autorizadas
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllZohoLeads, getAllZohoDeals, getAllZohoActivities, getZohoRecordTimeline, parseStageTransitionsFromTimeline } from '@/lib/services/zoho-crm';
import { syncZohoLead, syncZohoDeal, syncZohoActivity, logZohoSync, deleteZohoLeadsNotInZoho, deleteZohoDealsNotInZoho, query, getRecordsWithoutStageHistory, bulkInsertStageHistory } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

// Secret key para proteger el endpoint (debe coincidir con el cron job)
const CRON_SECRET = process.env.CRON_SECRET || 'change-this-secret-key';

// =====================================================
// ENDPOINT POST - SINCRONIZAR ZOHO
// =====================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  let syncType: 'leads' | 'deals' | 'full' = 'full';
  let recordsSynced = 0;
  let recordsUpdated = 0;
  let recordsCreated = 0;
  let recordsFailed = 0;
  let recordsDeleted = 0;
  let errorMessage: string | undefined;

  try {
    // 1. Verificar secret key
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '') || 
                          request.headers.get('x-cron-secret') ||
                          new URL(request.url).searchParams.get('secret');

    if (providedSecret !== CRON_SECRET) {
      logger.error('[ZohoSyncCron] Secret key inválida', undefined, {}, 'cron-sync-zoho');
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // 2. Obtener tipo de sincronización (opcional, por defecto 'full')
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');
    if (typeParam === 'leads' || typeParam === 'deals') {
      syncType = typeParam;
    }

    logger.info('[ZohoSyncCron] Iniciando sincronización automática', { syncType }, 'cron-sync-zoho');

    // 3. Sincronizar datos
    let zohoLeadIds: string[] = [];
    let zohoDealIds: string[] = [];
    
    if (syncType === 'leads' || syncType === 'full') {
      try {
        logger.info('[ZohoSyncCron] Sincronizando leads', {}, 'cron-sync-zoho');
        let leads;
        try {
          leads = await getAllZohoLeads();
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
            logger.error('[ZohoSyncCron] Network error connecting to Zoho', fetchError, { errorMessage }, 'cron-sync-zoho');
            throw new Error(errorMessage);
          }
          throw fetchError; // Re-lanzar otros errores
        }
        zohoLeadIds = leads.map(lead => lead.id);
        
        for (const lead of leads) {
          try {
            const wasCreated = await syncZohoLead(lead);
            recordsSynced++;
            if (wasCreated === true) {
              recordsCreated++;
            } else if (wasCreated === false) {
              recordsUpdated++;
            }
            // Si wasCreated es null, no se cuenta como creado ni actualizado (sin cambios)
          } catch (error) {
            recordsFailed++;
            logger.error(`[ZohoSyncCron] Error sincronizando lead`, error, { leadId: lead.id }, 'cron-sync-zoho');
          }
        }
        logger.info('[ZohoSyncCron] Sincronizados leads', { count: recordsSynced }, 'cron-sync-zoho');
        
        // Eliminar leads que ya no existen en Zoho
        try {
          logger.debug('[ZohoSyncCron] Verificando leads eliminados en Zoho', {}, 'cron-sync-zoho');
          const deletedCount = await deleteZohoLeadsNotInZoho(zohoLeadIds);
          recordsDeleted += deletedCount;
          if (deletedCount > 0) {
            logger.info('[ZohoSyncCron] Eliminados leads que ya no existen en Zoho', { deletedCount }, 'cron-sync-zoho');
          }
        } catch (deleteError) {
          logger.warn('[ZohoSyncCron] Error eliminando leads eliminados en Zoho', { error: deleteError }, 'cron-sync-zoho');
        }
      } catch (error) {
        errorMessage = `Error sincronizando leads: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('[ZohoSyncCron] Error sincronizando leads', error, {}, 'cron-sync-zoho');
      }
    }

    if (syncType === 'deals' || syncType === 'full') {
      try {
        logger.info('[ZohoSyncCron] Sincronizando deals', {}, 'cron-sync-zoho');
        let deals;
        try {
          deals = await getAllZohoDeals();
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
            logger.error('[ZohoSyncCron] Network error connecting to Zoho', fetchError, { errorMessage }, 'cron-sync-zoho');
            throw new Error(errorMessage);
          }
          throw fetchError; // Re-lanzar otros errores
        }
        zohoDealIds = deals.map(deal => deal.id);
        
        for (const deal of deals) {
          try {
            const wasCreated = await syncZohoDeal(deal);
            recordsSynced++;
            if (wasCreated === true) {
              recordsCreated++;
            } else if (wasCreated === false) {
              recordsUpdated++;
            }
            // Si wasCreated es null, no se cuenta como creado ni actualizado (sin cambios)
          } catch (error) {
            recordsFailed++;
            logger.error('[ZohoSyncCron] Error sincronizando deal', error, { dealId: deal.id }, 'cron-sync-zoho');
          }
        }
        logger.info('[ZohoSyncCron] Sincronizados deals', { count: recordsSynced }, 'cron-sync-zoho');
        
        // Eliminar deals que ya no existen en Zoho
        try {
          logger.debug('[ZohoSyncCron] Verificando deals eliminados en Zoho', {}, 'cron-sync-zoho');
          const deletedCount = await deleteZohoDealsNotInZoho(zohoDealIds);
          recordsDeleted += deletedCount;
          if (deletedCount > 0) {
            logger.info('[ZohoSyncCron] Eliminados deals que ya no existen en Zoho', { deletedCount }, 'cron-sync-zoho');
          }
        } catch (deleteError) {

          logger.warn('[ZohoSyncCron] Error eliminando deals eliminados en Zoho', { error: deleteError }, 'cron-sync-zoho');
        }
      } catch (error) {
        errorMessage = errorMessage 
          ? `${errorMessage}; Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`
          : `Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('[ZohoSyncCron] Error sincronizando deals', error, {}, 'cron-sync-zoho');
      }
    }

    // Backfill incremental de historial de etapas
    if (syncType === 'full') {
      try {
        const [leadIds, dealIds] = await Promise.all([
          getRecordsWithoutStageHistory('lead', 40),
          getRecordsWithoutStageHistory('deal', 35),
        ]);
        logger.info('[ZohoSyncCron] Stage history backfill', { leads: leadIds.length, deals: dealIds.length }, 'cron-sync-zoho');

        let backfillInserted = 0;
        const DELAY_MS = 450;

        for (const leadId of leadIds) {
          try {
            const timeline = await getZohoRecordTimeline('Leads', leadId);
            const transitions = parseStageTransitionsFromTimeline(timeline, 'Lead_Status');
            const meta = await query<{ desarrollo: string | null; owner_name: string | null }>(
              'SELECT desarrollo, owner_name FROM zoho_leads WHERE zoho_id = $1', [leadId]
            );
            const { desarrollo, owner_name } = meta.rows[0] ?? {};
            const entries = transitions.map(t => ({
              record_type: 'lead' as const, record_id: leadId,
              desarrollo: desarrollo ?? undefined, owner_name: owner_name ?? undefined,
              from_stage: t.from_stage, to_stage: t.to_stage, changed_at: t.changed_at,
            }));
            if (entries.length === 0) {
              const cur = await query<{ lead_status: string | null; created_time: Date | null }>(
                'SELECT lead_status, created_time FROM zoho_leads WHERE zoho_id = $1', [leadId]
              );
              if (cur.rows[0]?.lead_status) {
                entries.push({ record_type: 'lead', record_id: leadId,
                  desarrollo: desarrollo ?? undefined, owner_name: owner_name ?? undefined,
                  from_stage: null, to_stage: cur.rows[0].lead_status,
                  changed_at: cur.rows[0].created_time ?? new Date() });
              }
            }
            backfillInserted += await bulkInsertStageHistory(entries);
          } catch { /* no crítico */ }
          await new Promise(r => setTimeout(r, DELAY_MS));
        }

        for (const dealId of dealIds) {
          try {
            const timeline = await getZohoRecordTimeline('Deals', dealId);
            const transitions = parseStageTransitionsFromTimeline(timeline, 'Stage');
            const meta = await query<{ desarrollo: string | null; owner_name: string | null }>(
              'SELECT desarrollo, owner_name FROM zoho_deals WHERE zoho_id = $1', [dealId]
            );
            const { desarrollo, owner_name } = meta.rows[0] ?? {};
            const entries = transitions.map(t => ({
              record_type: 'deal' as const, record_id: dealId,
              desarrollo: desarrollo ?? undefined, owner_name: owner_name ?? undefined,
              from_stage: t.from_stage, to_stage: t.to_stage, changed_at: t.changed_at,
            }));
            if (entries.length === 0) {
              const cur = await query<{ stage: string | null; created_time: Date | null }>(
                'SELECT stage, created_time FROM zoho_deals WHERE zoho_id = $1', [dealId]
              );
              if (cur.rows[0]?.stage) {
                entries.push({ record_type: 'deal', record_id: dealId,
                  desarrollo: desarrollo ?? undefined, owner_name: owner_name ?? undefined,
                  from_stage: null, to_stage: cur.rows[0].stage,
                  changed_at: cur.rows[0].created_time ?? new Date() });
              }
            }
            backfillInserted += await bulkInsertStageHistory(entries);
          } catch { /* no crítico */ }
          await new Promise(r => setTimeout(r, DELAY_MS));
        }

        logger.info('[ZohoSyncCron] Backfill completado', { backfillInserted }, 'cron-sync-zoho');
      } catch {
        logger.warn('[ZohoSyncCron] Backfill failed (non-critical)', undefined, 'cron-sync-zoho');
      }
    }

    // Sincronizar actividades (solo en sync full)
    if (syncType === 'full') {
      try {
        logger.info('[ZohoSyncCron] Sincronizando actividades', {}, 'cron-sync-zoho');
        const activities = await getAllZohoActivities('all');
        let activitiesSynced = 0;
        for (const activity of activities) {
          try {
            const leadId = activity.Who_Id?.id;
            const dealId = activity.What_Id?.id;
            let actDesarrollo: string | undefined;
            if (leadId) {
              const r = await query<{ desarrollo: string | null }>('SELECT desarrollo FROM zoho_leads WHERE zoho_id=$1', [leadId]);
              actDesarrollo = r.rows[0]?.desarrollo ?? undefined;
            } else if (dealId) {
              const r = await query<{ desarrollo: string | null }>('SELECT desarrollo FROM zoho_deals WHERE zoho_id=$1', [dealId]);
              actDesarrollo = r.rows[0]?.desarrollo ?? undefined;
            }
            await syncZohoActivity(activity, leadId, dealId, actDesarrollo);
            activitiesSynced++;
          } catch {
            logger.warn('[ZohoSyncCron] Error sincronizando actividad', { activityId: activity.id }, 'cron-sync-zoho');
          }
        }
        logger.info('[ZohoSyncCron] Actividades sincronizadas', { activitiesSynced }, 'cron-sync-zoho');
      } catch {
        logger.warn('[ZohoSyncCron] Activities sync failed (non-critical)', undefined, 'cron-sync-zoho');
      }
    }

    const durationMs = Date.now() - startTime;
    const status = recordsFailed === 0 ? 'success' : (recordsSynced > 0 ? 'partial' : 'error');

    // 4. Registrar log de sincronización
    await logZohoSync(syncType, status, {
      recordsSynced,
      recordsUpdated,
      recordsCreated,
      recordsFailed,
      recordsDeleted,
      errorMessage,
      durationMs,
    });

    logger.info('[ZohoSyncCron] Sincronización completada', { 
      status, 
      recordsSynced, 
      recordsDeleted, 
      durationMs 
    }, 'cron-sync-zoho');

    return NextResponse.json({
      success: true,
      syncType,
      status,
      recordsSynced,
      recordsUpdated,
      recordsCreated,
      recordsFailed,
      recordsDeleted,
      durationMs,
      errorMessage,
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
        '[ZohoSyncCron] Could not log sync error (non-critical)', 
        { 
          error: logError instanceof Error ? logError.message : String(logError),
          syncType 
        }, 
        'cron-sync-zoho'
      );
    }

    logger.error('[ZohoSyncCron] Error fatal', undefined, { errorMsg }, 'cron-sync-zoho');

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






