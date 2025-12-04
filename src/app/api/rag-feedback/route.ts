/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - RAG FEEDBACK API ENDPOINT
 * =====================================================
 * Endpoint para calificar respuestas del agente:
 * - Permite a los usuarios calificar respuestas (1-5)
 * - Guarda feedback en query_logs
 * - Actualiza estadísticas de chunks usados
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { saveFeedback, updateChunkStats } from '@/lib/postgres';

// =====================================================
// TIPOS
// =====================================================

interface FeedbackRequest {
  query_log_id: number;
  rating: number; // 1 a 5
  comment?: string | null;
}

// =====================================================
// ENDPOINT POST - GUARDAR FEEDBACK
// =====================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No autorizado' 
        },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Token inválido o expirado' 
        },
        { status: 401 }
      );
    }

    // 2. Parsear el body
    const body: FeedbackRequest = await request.json();
    const { query_log_id, rating, comment } = body;

    // 3. Validar campos requeridos
    if (!query_log_id || !rating) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Campos requeridos: query_log_id, rating' 
        },
        { status: 400 }
      );
    }

    // 4. Validar rango de rating
    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'El rating debe estar entre 1 y 5' 
        },
        { status: 400 }
      );
    }

    // 5. Guardar feedback en query_logs
    const feedback = await saveFeedback({
      query_log_id,
      rating,
      comment: comment || null,
    });

    // 6. Actualizar estadísticas de chunks usados en esta consulta
    // Esto se hace automáticamente cuando se guarda el feedback
    await updateChunkStats(query_log_id, rating);

    // 7. Retornar respuesta exitosa
    return NextResponse.json({
      success: true,
      message: 'Feedback guardado exitosamente',
      feedback_id: feedback.id,
    });

  } catch (error) {
    console.error('❌ Error en RAG feedback:', error);

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
    endpoint: '/api/rag-feedback',
    method: 'POST',
    description: 'Califica una respuesta del agente RAG',
    requiredFields: {
      query_log_id: 'ID del log de consulta (number)',
      rating: 'Calificación de 1 a 5 (number)',
    },
    optionalFields: {
      comment: 'Comentario opcional sobre la respuesta (string)',
    },
    example: {
      request: {
        query_log_id: 123,
        rating: 5,
        comment: 'Excelente respuesta, muy útil',
      },
    },
  });
}

