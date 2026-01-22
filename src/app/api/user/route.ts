/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - USER API ENDPOINT
 * =====================================================
 * Endpoint para obtener información del usuario actual
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { User, APIResponse } from '@/types/documents';

// Forzar renderizado dinámico (esta ruta usa request.url que es dinámico)
export const dynamic = 'force-dynamic';

// =====================================================
// ENDPOINT GET - OBTENER USUARIO
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<User>>> {
  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');

    if (!userIdParam) {
      return NextResponse.json(
        {
          success: false,
          error: 'El parámetro userId es requerido',
        },
        { status: 400 }
      );
    }

    const userId = parseInt(userIdParam);
    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario no encontrado',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });

  } catch (error) {
    logger.error('Error obteniendo usuario', error, {}, 'user');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo usuario',
      },
      { status: 500 }
    );
  }
}



