/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - DOCUMENTS API ENDPOINT
 * =====================================================
 * Endpoint para obtener y gestionar documentos
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '@/lib/postgres';
import { memoryCache } from '@/lib/memory-cache';
import type { DocumentMetadata, APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER DOCUMENTOS
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<DocumentMetadata[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parámetro opcional para invalidar caché
    const invalidateCache = searchParams.get('invalidate') === 'true';
    
    if (invalidateCache) {
      memoryCache.invalidate('documents*');
      console.log('🔄 Caché de documentos invalidado');
    }
    
    const filters = {
      zone: searchParams.get('zone') || undefined,
      development: searchParams.get('development') || undefined,
      type: searchParams.get('type') || undefined,
    };

    // Usar caché en memoria para mejorar rendimiento
    const documents = await memoryCache.getCachedDocuments(
      filters,
      () => getDocuments(filters)
    );

    // Log para debugging
    console.log(`📄 Documentos obtenidos: ${documents.length}`);

    // Configurar headers de caché HTTP para Next.js
    const response = NextResponse.json({
      success: true,
      data: documents,
    });

    // Cachear en el cliente por 2 minutos
    response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    return response;

  } catch (error) {
    console.error('❌ Error obteniendo documentos:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo documentos',
      },
      { status: 500 }
    );
  }
}

