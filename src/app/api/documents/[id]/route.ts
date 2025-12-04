/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - DOCUMENT DELETE ENDPOINT
 * =====================================================
 * Endpoint para eliminar un documento específico
 * Elimina tanto de Pinecone como de PostgreSQL
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById, deleteDocument, hasPermission, checkUserAccess, saveActionLog } from '@/lib/postgres';
import { deleteDocumentChunks } from '@/lib/pinecone';
import { memoryCache } from '@/lib/memory-cache';
import type { APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT DELETE - ELIMINAR DOCUMENTO
// =====================================================

/**
 * DELETE /api/documents/[id]
 * Elimina un documento específico de Pinecone y PostgreSQL
 * 
 * Query params:
 * - userId: ID del usuario que solicita la eliminación (requerido)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<{ deleted: number }>>> {
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

    // 3. Obtener información del documento
    const document = await getDocumentById(documentId);
    
    if (!document) {
      return NextResponse.json({
        success: false,
        error: `Documento con ID ${documentId} no encontrado`,
      }, { status: 404 });
    }

    console.log(`🔍 Documento encontrado: ${document.filename} (ID: ${documentId})`);

    // 4. Verificar permisos del usuario
    // El usuario necesita tener permiso de eliminar documentos
    const hasDeletePermission = await hasPermission(userId, 'delete_documents');
    
    if (!hasDeletePermission) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permisos para eliminar documentos',
      }, { status: 403 });
    }

    // 5. Verificar acceso a la zona/desarrollo
    // Solo puede eliminar si tiene acceso de escritura (can_upload) al desarrollo
    const hasZoneAccess = await checkUserAccess(
      userId, 
      document.zone, 
      document.development, 
      'can_upload'
    );
    
    if (!hasZoneAccess) {
      return NextResponse.json({
        success: false,
        error: 'No tienes acceso para eliminar documentos de este desarrollo',
      }, { status: 403 });
    }

    // 6. Eliminar chunks de Pinecone
    try {
      // Los chunks del documento se identifican por sourceFileName
      // dentro del namespace de la zona
      if (document.pinecone_namespace && document.filename) {
        console.log(`🗑️ Eliminando chunks de Pinecone...`);
        console.log(`   Namespace: ${document.pinecone_namespace}`);
        console.log(`   Archivo: ${document.filename}`);
        
        // Elimina solo los chunks de este documento específico
        // usando el filtro de sourceFileName
        await deleteDocumentChunks(document.pinecone_namespace, document.filename);
        console.log(`✅ Chunks eliminados de Pinecone`);
      } else {
        console.warn(`⚠️ Documento sin namespace o filename registrado`);
      }
    } catch (pineconeError) {
      console.error('❌ Error eliminando de Pinecone:', pineconeError);
      // Continuamos para eliminar de PostgreSQL aunque falle Pinecone
      // para evitar datos huérfanos en la DB
    }

    // 7. Eliminar metadata de PostgreSQL
    const deleted = await deleteDocument(documentId);
    
    if (!deleted) {
      return NextResponse.json({
        success: false,
        error: 'Error eliminando documento de la base de datos',
      }, { status: 500 });
    }

    // 8. Invalidar caché relacionado (documentos y desarrollos cambiaron)
    memoryCache.invalidate('documents*');
    memoryCache.invalidate('developments*');
    memoryCache.invalidate('stats*');
    console.log('🔄 Caché invalidado después de eliminar documento');

    // 9. Registrar acción en logs
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    await saveActionLog({
      user_id: userId,
      action_type: 'delete',
      resource_type: 'document',
      resource_id: documentId,
      zone: document.zone,
      development: document.development,
      description: `Documento "${document.filename}" eliminado`,
      metadata: {
        filename: document.filename,
        type: document.type,
        namespace: document.pinecone_namespace,
      },
      ip_address: clientIp,
      user_agent: userAgent,
    });

    console.log(`✅ Documento ${documentId} eliminado exitosamente`);

    return NextResponse.json({
      success: true,
      data: { deleted: documentId },
      message: `Documento "${document.filename}" eliminado exitosamente`,
    });

  } catch (error) {
    console.error('❌ Error eliminando documento:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error eliminando documento',
    }, { status: 500 });
  }
}

// =====================================================
// ENDPOINT GET - OBTENER DOCUMENTO POR ID
// =====================================================

/**
 * GET /api/documents/[id]
 * Obtiene información de un documento específico
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<any>>> {
  try {
    const documentId = parseInt(params.id);
    
    if (isNaN(documentId)) {
      return NextResponse.json({
        success: false,
        error: 'ID de documento inválido',
      }, { status: 400 });
    }

    const document = await getDocumentById(documentId);
    
    if (!document) {
      return NextResponse.json({
        success: false,
        error: 'Documento no encontrado',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: document,
    });

  } catch (error) {
    console.error('❌ Error obteniendo documento:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo documento',
    }, { status: 500 });
  }
}

