/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - REFRESH TOKEN ENDPOINT
 * =====================================================
 * Endpoint para refrescar tokens de acceso
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRefreshToken, generateAccessToken } from '@/lib/auth/auth';
import { getUserById, getUserSession } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ accessToken: string }>>> {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Refresh token es requerido',
        },
        { status: 400 }
      );
    }

    // Verificar refresh token
    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: 'Refresh token inválido o expirado',
        },
        { status: 401 }
      );
    }

    // Verificar que la sesión existe
    const session = await getUserSession(refreshToken);
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sesión no encontrada',
        },
        { status: 401 }
      );
    }

    // Verificar que el usuario existe y está activo
    const user = await getUserById(payload.userId);
    if (!user || !user.is_active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario no encontrado o inactivo',
        },
        { status: 404 }
      );
    }

    // Generar nuevo access token
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      data: { accessToken },
    });

  } catch (error) {
    logger.error('Error en refresh', error, {}, 'auth-refresh');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al refrescar token',
      },
      { status: 500 }
    );
  }
}




