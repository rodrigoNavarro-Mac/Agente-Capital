/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - CRON ENDPOINT
 * =====================================================
 * Endpoint para procesar feedback y actualizar aprendizaje
 * Se ejecuta automáticamente cada día mediante cron job
 * 
 * Protegido con secret key para evitar ejecuciones no autorizadas
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecentFeedback, upsertLearnedResponse } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

// Secret key para proteger el endpoint (debe coincidir con el cron job)
const CRON_SECRET = process.env.CRON_SECRET || 'change-this-secret-key';

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Normaliza una consulta para agrupar variaciones similares
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Normalizar espacios
    .replace(/[¿?¡!.,;:]/g, ''); // Remover puntuación
}

/**
 * Convierte rating (1-5) a score de calidad (-1 a +1)
 */
function ratingToQualityScore(rating: number): number {
  // Convierte 1-5 a -1 a +1
  // 1 -> -1, 2 -> -0.5, 3 -> 0, 4 -> 0.5, 5 -> 1
  return (rating - 3) / 2;
}

// =====================================================
// ENDPOINT POST - PROCESAR FEEDBACK
// =====================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verificar autenticación mediante secret key
    const authHeader = request.headers.get('authorization');
    const cronSecret = authHeader?.replace('Bearer ', '') || 
                      request.headers.get('x-cron-secret') ||
                      new URL(request.url).searchParams.get('secret');

    if (!cronSecret || cronSecret !== CRON_SECRET) {
      logger.error('Intento de acceso no autorizado al endpoint de cron', undefined, {}, 'cron-process-feedback');
      return NextResponse.json(
        { 
          success: false, 
          error: 'No autorizado' 
        },
        { status: 401 }
      );
    }

    logger.info('Iniciando procesamiento de feedback para aprendizaje', {}, 'cron-process-feedback');
    
    // 2. Obtener feedback de las últimas 24 horas
    const feedbackData = await getRecentFeedback(24);
    
    logger.info('Encontrados registros con feedback', { count: feedbackData.length }, 'cron-process-feedback');
    
    if (feedbackData.length === 0) {
      logger.info('No hay feedback nuevo para procesar', {}, 'cron-process-feedback');
      return NextResponse.json({
        success: true,
        message: 'No hay feedback nuevo para procesar',
        processed: 0,
        updated: 0,
        created: 0,
      });
    }
    
    // 3. Procesar cada feedback
    let processed = 0;
    let updated = 0;
    let created = 0;
    const errors: string[] = [];
    
    for (const row of feedbackData) {
      try {
        const normalizedQuery = normalizeQuery(row.query);
        const qualityScore = ratingToQualityScore(row.feedback_rating);
        
        // Verificar si ya existe una respuesta aprendida para esta consulta
        // upsertLearnedResponse maneja la lógica de actualización o creación
        const result = await upsertLearnedResponse(normalizedQuery, row.response, qualityScore);
        
        if (result.created) {
          created++;
        } else if (result.updated) {
          updated++;
        }
        
        processed++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        errors.push(`Error procesando feedback ${row.id}: ${errorMsg}`);
        logger.error('Error procesando feedback', error, { feedbackId: row.id }, 'cron-process-feedback');
      }
    }
    
    logger.info('Procesamiento completado', { 
      processed, 
      updated, 
      created 
    }, 'cron-process-feedback');
    
    if (errors.length > 0) {
      logger.warn('Se encontraron errores durante el procesamiento', { errorCount: errors.length }, 'cron-process-feedback');
    }
    
    return NextResponse.json({
      success: true,
      message: 'Procesamiento de feedback completado',
      processed,
      updated,
      created,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    logger.error('Error en procesamiento de feedback', error, {}, 'cron-process-feedback');
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error procesando el feedback' 
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT GET - INFO Y HEALTH CHECK
// =====================================================

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: '/api/cron/process-feedback-learning',
    method: 'POST',
    description: 'Procesa feedback de las últimas 24 horas y actualiza respuestas aprendidas',
    authentication: {
      method: 'Secret key',
      header: 'Authorization: Bearer <CRON_SECRET>',
      alternative: 'x-cron-secret header o ?secret= query param',
    },
    schedule: 'Ejecutar diariamente (recomendado: 2 AM)',
    environment: {
      CRON_SECRET: 'Secret key configurado en variables de entorno',
    },
  });
}



