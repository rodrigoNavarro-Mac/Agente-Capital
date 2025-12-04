/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LOGOUT ENDPOINT
 * =====================================================
 * Endpoint para cerrar sesión
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { deleteUserSession } from '@/lib/postgres';
import type { APIResponse } from '@/types/documents';

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ message: string }>>> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      // Verificar token y eliminar sesión
      const payload = verifyAccessToken(token);
      if (payload) {
        await deleteUserSession(token);
      }
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Sesión cerrada exitosamente' },
    });

  } catch (error) {
    console.error('❌ Error en logout:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al cerrar sesión',
      },
      { status: 500 }
    );
  }
}

