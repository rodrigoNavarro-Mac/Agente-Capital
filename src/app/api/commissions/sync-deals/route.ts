/**
 * =====================================================
 * API: SYNC DEALS PARA EL MODULO DE COMISIONES
 * =====================================================
 * Endpoint dedicado para el modulo de comisiones.
 *
 * Por que existe este endpoint (y no usamos /api/zoho/sync):
 * - El modulo de comisiones depende exclusivamente de los DEALS de Zoho.
 *   No necesita leads, notas de leads, ni actividades.
 * - Hacer un sync full desde /api/zoho/sync sobrecarga la API de Zoho y se
 *   acerca al limite de 300s de Vercel cuando hay miles de registros.
 * - Aqui solo bajamos los deals que cambiaron desde el ultimo sync
 *   (sync incremental con If-Modified-Since) y luego procesamos las ventas
 *   comisionables desde la BD local.
 *
 * Flujo:
 *  1. Auth + permisos (admin / ceo).
 *  2. Sync incremental de deals desde Zoho a la tabla local zoho_deals.
 *  3. Sync de notas SOLO de los deals que vinieron en esta tanda.
 *  4. Procesar deals "Closed Won" hacia commission_sales (reusa logica existente).
 *
 * Parametros query:
 * - ?force=true      : ignora If-Modified-Since y baja TODOS los deals.
 *                      Tambien ejecuta delete de deals que ya no existan en Zoho.
 * - ?skipProcess=true: solo sincroniza, no procesa ventas comisionables.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import {
  getAllZohoDeals,
  getZohoNotesForRecords,
} from '@/lib/services/zoho-crm';
import {
  syncZohoDeal,
  syncZohoNote,
  logZohoSync,
  deleteZohoDealsNotInZoho,
  getLastModifiedTime,
} from '@/lib/db/postgres';
import { processClosedWonDealsFromLocalDB } from '@/lib/db/commission-db';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';
// Tope maximo en Vercel Pro. En sync incremental rara vez nos acercaremos
// a este numero, pero lo dejamos explicito por seguridad.
export const maxDuration = 300;

const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * Procesa un arreglo en chunks paralelos (concurrency controlada).
 * Mismo patron que usamos en /api/zoho/sync: evita 2000 awaits secuenciales
 * pero tampoco mete N peticiones concurrentes que saturen Postgres o Zoho.
 */
async function processInChunks<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>,
): Promise<Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }>> {
  const results: Array<
    { status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }
  > = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map((item, idx) => handler(item, i + idx)),
    );
    results.push(...chunkResults);
  }
  return results;
}

export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  const startTime = Date.now();
  const logScope = 'commissions-sync-deals';
  let recordsSynced = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsFailed = 0;
  let recordsDeleted = 0;
  let errorMessage: string | undefined;

  try {
    // 1) Verificar auth
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 },
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token invalido o expirado' },
        { status: 401 },
      );
    }

    // 2) Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para sincronizar deals desde Zoho' },
        { status: 403 },
      );
    }

    // 3) Parametros
    const { searchParams } = new URL(request.url);
    const forceFull = searchParams.get('force') === 'true';
    const skipProcess = searchParams.get('skipProcess') === 'true';

    // 4) Sync de deals (incremental por defecto)
    const dealsSince = forceFull ? null : await getLastModifiedTime('zoho_deals');
    logger.info('Starting commission deals sync', {
      mode: dealsSince ? 'incremental' : 'full',
      since: dealsSince?.toISOString(),
    }, logScope);

    let deals;
    try {
      deals = await getAllZohoDeals(dealsSince ?? undefined);
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const isNetworkError = errorMsg.includes('ENOTFOUND') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('fetch failed');
      if (isNetworkError) {
        throw new Error('Error de conexion con Zoho. Verifica tu conexion a internet.');
      }
      throw fetchError;
    }

    const zohoDealIds = deals.map(d => d.id);
    logger.debug('Deals fetched from Zoho', { count: deals.length }, logScope);

    // Insertar/actualizar deals en BD local (chunks de 15 en paralelo)
    const dealResults = await processInChunks(deals, 15, async (deal) => {
      return await syncZohoDeal(deal);
    });

    dealResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        recordsSynced++;
        if (result.value === true) recordsCreated++;
        else if (result.value === false) recordsUpdated++;
      } else {
        recordsFailed++;
        logger.error('Error syncing deal', result.reason, { dealId: deals[idx]?.id }, logScope);
      }
    });

    logger.info('Deals sync completed', {
      recordsSynced, recordsCreated, recordsUpdated, recordsFailed,
    }, logScope);

    // Notas SOLO de los deals que vinieron (en incremental son pocos)
    if (zohoDealIds.length > 0) {
      try {
        const notesMap = await getZohoNotesForRecords('Deals', zohoDealIds);
        const noteTasks: Array<{ note: any; dealId: string }> = [];
        notesMap.forEach((notes, dealId) => {
          notes.forEach(note => noteTasks.push({ note, dealId }));
        });
        if (noteTasks.length > 0) {
          await processInChunks(noteTasks, 20, async ({ note, dealId }) => {
            return await syncZohoNote(note, 'Deals', dealId);
          });
          logger.debug('Deal notes synced', { count: noteTasks.length }, logScope);
        }
      } catch (notesError) {
        // No critico: las notas son secundarias
        logger.warn('Failed batch syncing notes for deals (non-critical)', undefined, logScope);
        logger.error('Notes batch sync error', notesError, undefined, logScope);
      }
    }

    // Deletes SOLO en force=true (incremental no trae lista completa)
    if (forceFull) {
      try {
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

    // 5) Procesar deals locales hacia commission_sales (reusa logica existente)
    let processResult: {
      processed: number;
      skipped: number;
      errors: number;
      errorsList: string[];
      partnersSynced: number;
    } | null = null;

    if (!skipProcess) {
      try {
        logger.info('Processing closed-won deals into commission_sales', {}, logScope);
        processResult = await processClosedWonDealsFromLocalDB();
        logger.info('Commission sales processed', {
          processed: processResult.processed,
          skipped: processResult.skipped,
          errors: processResult.errors,
          partnersSynced: processResult.partnersSynced,
        }, logScope);
      } catch (procError) {
        logger.error('Failed processing commission sales', procError, undefined, logScope);
        errorMessage = procError instanceof Error ? procError.message : String(procError);
      }
    }

    // 6) Log del sync (reusa la tabla zoho_sync_log para tener trazabilidad unificada)
    const durationMs = Date.now() - startTime;
    const status = recordsFailed === 0 ? 'success' : (recordsSynced > 0 ? 'partial' : 'error');
    try {
      await logZohoSync('deals', status, {
        recordsSynced,
        recordsUpdated,
        recordsCreated,
        recordsFailed,
        recordsDeleted,
        errorMessage,
        durationMs,
      });
    } catch (logErr) {
      // No critico
      logger.warn('Could not write sync log (non-critical)', undefined, logScope);
      logger.error('Log write error', logErr, undefined, logScope);
    }

    // 7) Respuesta
    const messageParts: string[] = [];
    messageParts.push(`${recordsSynced} deals sincronizados`);
    if (recordsCreated > 0) messageParts.push(`${recordsCreated} nuevos`);
    if (recordsUpdated > 0) messageParts.push(`${recordsUpdated} actualizados`);
    if (recordsFailed > 0) messageParts.push(`${recordsFailed} con error`);
    if (processResult) {
      messageParts.push(
        `${processResult.processed} ventas nuevas`,
        `${processResult.skipped} ventas actualizadas`,
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        mode: forceFull ? 'full' : 'incremental',
        status,
        recordsSynced,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        recordsDeleted,
        durationMs,
        durationSeconds: Math.round(durationMs / 1000),
        commissionProcessing: processResult,
        message: messageParts.join(', '),
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido sincronizando deals';
    logger.error('Unhandled error during commission deals sync', error, { durationMs }, logScope);

    try {
      await logZohoSync('deals', 'error', {
        recordsSynced,
        recordsUpdated,
        recordsCreated,
        recordsFailed,
        recordsDeleted,
        errorMessage: errorMsg,
        durationMs,
      });
    } catch {
      // Ignorado: no fallar si el log no se puede escribir
    }

    const statusCode = errorMsg.includes('Error de conexion') ? 503 : 500;
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: statusCode },
    );
  }
}
