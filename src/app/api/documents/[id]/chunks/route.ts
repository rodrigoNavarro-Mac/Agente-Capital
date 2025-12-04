/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - DOCUMENT CHUNKS ENDPOINT
 * =====================================================
 * Endpoint para obtener los chunks de un documento específico
 * Solo disponible para administradores
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById, getUserById } from '@/lib/postgres';
import { getDocumentChunks } from '@/lib/pinecone';
import type { APIResponse, PineconeMatch } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER CHUNKS DE DOCUMENTO
// =====================================================

/**
 * GET /api/documents/[id]/chunks
 * Obtiene todos los chunks de un documento específico desde Pinecone
 * Solo disponible para administradores
 * 
 * Query params:
 * - userId: ID del usuario que solicita los chunks (requerido)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<{ chunks: PineconeMatch[]; documentText: string }>>> {
  try {
    // 1. Parsear el ID del documento
    const documentId = parseInt(params.id);
    
    if (isNaN(documentId)) {
      return NextResponse.json({
        success: false,
        error: 'ID de documento inválido',
      }, { status: 400 });
    }

    // 2. Obtener userId desde query params
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    
    if (!userIdParam) {
      return NextResponse.json({
        success: false,
        error: 'Se requiere userId como query param',
      }, { status: 400 });
    }

    const userId = parseInt(userIdParam);
    if (isNaN(userId)) {
      return NextResponse.json({
        success: false,
        error: 'userId inválido',
      }, { status: 400 });
    }

    // 3. Verificar que el usuario es admin
    const user = await getUserById(userId);
    if (!user || (user.role !== 'admin' && user.role !== 'ceo')) {
      return NextResponse.json({
        success: false,
        error: 'Solo los administradores pueden ver los chunks de los documentos',
      }, { status: 403 });
    }

    // 4. Obtener información del documento
    const document = await getDocumentById(documentId);
    
    if (!document) {
      return NextResponse.json({
        success: false,
        error: `Documento con ID ${documentId} no encontrado`,
      }, { status: 404 });
    }

    console.log(`🔍 Obteniendo chunks del documento: ${document.filename} (ID: ${documentId})`);

    // 5. Obtener chunks desde Pinecone
    if (!document.pinecone_namespace || !document.filename) {
      return NextResponse.json({
        success: false,
        error: 'El documento no tiene namespace o filename registrado',
      }, { status: 400 });
    }

    const chunks = await getDocumentChunks(document.pinecone_namespace, document.filename);
    
    // 6. Reconstruir el texto completo del documento concatenando los chunks
    const documentText = chunks
      .map(chunk => chunk.metadata.text || '')
      .join('\n\n');

    console.log(`✅ Obtenidos ${chunks.length} chunks del documento`);

    return NextResponse.json({
      success: true,
      data: {
        chunks,
        documentText,
      },
    });

  } catch (error) {
    console.error('❌ Error obteniendo chunks del documento:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo chunks del documento',
    }, { status: 500 });
  }
}

