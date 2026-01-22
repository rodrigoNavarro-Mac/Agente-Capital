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
import { getAllZohoLeads, getAllZohoDeals } from '@/lib/services/zoho-crm';
import { syncZohoLead, syncZohoDeal, logZohoSync, deleteZohoLeadsNotInZoho, deleteZohoDealsNotInZoho } from '@/lib/db/postgres';
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






