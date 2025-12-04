/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - DOCUMENTS API ENDPOINT
 * =====================================================
 * Endpoint para obtener y gestionar documentos
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '@/lib/postgres';
import { memoryCache } from '@/lib/memory-cache';
import type { DocumentMetadata, APIResponse, Zone, DocumentContentType } from '@/types/documents';

// Forzar renderizado dinámico (esta ruta usa request.url que es dinámico)
export const dynamic = 'force-dynamic';

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
    
    // Validar y convertir los parámetros a los tipos correctos
    const zoneParam = searchParams.get('zone');
    const developmentParam = searchParams.get('development');
    const typeParam = searchParams.get('type');

    // Validar que zone sea un Zone válido
    const validZones: Zone[] = ['yucatan', 'puebla', 'quintana_roo', 'cdmx', 'jalisco', 'nuevo_leon'];
    const zone: Zone | undefined = zoneParam && validZones.includes(zoneParam as Zone) 
      ? (zoneParam as Zone) 
      : undefined;

    // Validar que type sea un DocumentContentType válido
    const validTypes: DocumentContentType[] = [
      'brochure', 'policy', 'price', 'inventory', 'floor_plan', 
      'amenities', 'legal', 'faq', 'general'
    ];
    const type: DocumentContentType | undefined = typeParam && validTypes.includes(typeParam as DocumentContentType)
      ? (typeParam as DocumentContentType)
      : undefined;

    const filters = {
      zone,
      development: developmentParam || undefined,
      type,
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

