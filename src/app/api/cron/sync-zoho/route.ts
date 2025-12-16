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
import { getAllZohoLeads, getAllZohoDeals } from '@/lib/zoho-crm';
import { syncZohoLead, syncZohoDeal, logZohoSync, deleteZohoLeadsNotInZoho, deleteZohoDealsNotInZoho } from '@/lib/postgres';

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
      console.error('❌ [ZohoSyncCron] Secret key inválida');
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

    console.log(`🔄 [ZohoSyncCron] Iniciando sincronización automática: ${syncType}`);

    // 3. Sincronizar datos
    let zohoLeadIds: string[] = [];
    let zohoDealIds: string[] = [];
    
    if (syncType === 'leads' || syncType === 'full') {
      try {
        console.log('🔄 [ZohoSyncCron] Sincronizando leads...');
        const leads = await getAllZohoLeads();
        zohoLeadIds = leads.map(lead => lead.id);
        
        for (const lead of leads) {
          try {
            const wasCreated = await syncZohoLead(lead);
            recordsSynced++;
            if (wasCreated) {
              recordsCreated++;
            } else {
              recordsUpdated++;
            }
          } catch (error) {
            recordsFailed++;
            console.error(`❌ [ZohoSyncCron] Error sincronizando lead ${lead.id}:`, error);
          }
        }
        console.log(`✅ [ZohoSyncCron] Sincronizados ${recordsSynced} leads`);
        
        // Eliminar leads que ya no existen en Zoho
        try {
          console.log('🗑️ [ZohoSyncCron] Verificando leads eliminados en Zoho...');
          const deletedCount = await deleteZohoLeadsNotInZoho(zohoLeadIds);
          recordsDeleted += deletedCount;
          if (deletedCount > 0) {
            console.log(`✅ [ZohoSyncCron] Eliminados ${deletedCount} leads que ya no existen en Zoho`);
          }
        } catch (deleteError) {
          console.warn('⚠️ [ZohoSyncCron] Error eliminando leads eliminados en Zoho:', deleteError);
        }
      } catch (error) {
        errorMessage = `Error sincronizando leads: ${error instanceof Error ? error.message : String(error)}`;
        console.error('❌ [ZohoSyncCron]', errorMessage);
      }
    }

    if (syncType === 'deals' || syncType === 'full') {
      try {
        console.log('🔄 [ZohoSyncCron] Sincronizando deals...');
        const deals = await getAllZohoDeals();
        zohoDealIds = deals.map(deal => deal.id);
        
        for (const deal of deals) {
          try {
            const wasCreated = await syncZohoDeal(deal);
            recordsSynced++;
            if (wasCreated) {
              recordsCreated++;
            } else {
              recordsUpdated++;
            }
          } catch (error) {
            recordsFailed++;
            console.error(`❌ [ZohoSyncCron] Error sincronizando deal ${deal.id}:`, error);
          }
        }
        console.log(`✅ [ZohoSyncCron] Sincronizados ${recordsSynced} deals`);
        
        // Eliminar deals que ya no existen en Zoho
        try {
          console.log('🗑️ [ZohoSyncCron] Verificando deals eliminados en Zoho...');
          const deletedCount = await deleteZohoDealsNotInZoho(zohoDealIds);
          recordsDeleted += deletedCount;
          if (deletedCount > 0) {
            console.log(`✅ [ZohoSyncCron] Eliminados ${deletedCount} deals que ya no existen en Zoho`);
          }
        } catch (deleteError) {
          console.warn('⚠️ [ZohoSyncCron] Error eliminando deals eliminados en Zoho:', deleteError);
        }
      } catch (error) {
        errorMessage = errorMessage 
          ? `${errorMessage}; Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`
          : `Error sincronizando deals: ${error instanceof Error ? error.message : String(error)}`;
        console.error('❌ [ZohoSyncCron]', errorMessage);
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

    console.log(`✅ [ZohoSyncCron] Sincronización completada: ${status} (${recordsSynced} registros sincronizados, ${recordsDeleted} eliminados en ${durationMs}ms)`);

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
    
    await logZohoSync(syncType, 'error', {
      recordsSynced,
      recordsUpdated,
      recordsCreated,
      recordsFailed,
      recordsDeleted,
      errorMessage: errorMsg,
      durationMs,
    });

    console.error('❌ [ZohoSyncCron] Error fatal:', errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}



