/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LOGOUT ENDPOINT
 * =====================================================
 * Endpoint para cerrar sesión
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { deleteUserSession } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
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
    logger.error('Error en logout', error, {}, 'auth-logout');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al cerrar sesión',
      },
      { status: 500 }
    );
  }
}




