import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { hasPermission } from '@/lib/postgres';
import type { Permission } from '@/types/documents';

/**
 * Endpoint para verificar si un usuario tiene un permiso específico
 * GET /api/permissions/check?permission=upload_documents
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Obtener token de autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Verificar y decodificar token para obtener userId
    const payload = verifyAccessToken(token);
    if (!payload || !payload.userId) {
      return NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }

    // Obtener el permiso a verificar desde los query params
    const { searchParams } = new URL(request.url);
    const permission = searchParams.get('permission') as Permission | null;

    if (!permission) {
      return NextResponse.json(
        { success: false, error: 'Permiso no especificado' },
        { status: 400 }
      );
    }

    // Verificar si el usuario tiene el permiso
    const hasAccess = await hasPermission(payload.userId, permission);

    return NextResponse.json({
      success: true,
      hasPermission: hasAccess,
    });
  } catch (error) {
    console.error('Error verificando permiso:', error);
    return NextResponse.json(
      { success: false, error: 'Error al verificar permiso' },
      { status: 500 }
    );
  }
}

