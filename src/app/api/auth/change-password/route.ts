/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - CHANGE PASSWORD ENDPOINT
 * =====================================================
 * Endpoint para cambiar contraseña (requiere autenticación)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUserPassword } from '@/lib/postgres';
import { verifyPassword, hashPassword, validatePasswordStrength, extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { validateRequest, changePasswordRequestSchema } from '@/lib/validation';
import type { APIResponse } from '@/types/documents';

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ message: string }>>> {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'No autorizado',
        },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token inválido o expirado',
        },
        { status: 401 }
      );
    }

    const rawBody = await request.json();
    const validation = validateRequest(changePasswordRequestSchema, rawBody, 'auth-change-password');
    
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
        },
        { status: validation.status }
      );
    }
    
    const { currentPassword, newPassword } = validation.data;

    // Validar fortaleza de nueva contraseña
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: passwordValidation.errors.join(', '),
        },
        { status: 400 }
      );
    }

    // Obtener usuario
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

    if (!user.password_hash) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes contraseña configurada',
        },
        { status: 400 }
      );
    }

    // Verificar contraseña actual
    const passwordValid = await verifyPassword(currentPassword, user.password_hash);

    if (!passwordValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Contraseña actual incorrecta',
        },
        { status: 401 }
      );
    }

    // Verificar que la nueva contraseña sea diferente
    const samePassword = await verifyPassword(newPassword, user.password_hash);
    if (samePassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'La nueva contraseña debe ser diferente a la actual',
        },
        { status: 400 }
      );
    }

    // Hashear nueva contraseña
    const passwordHash = await hashPassword(newPassword);

    // Actualizar contraseña
    await updateUserPassword(payload.userId, passwordHash);

    return NextResponse.json({
      success: true,
      data: { message: 'Contraseña actualizada exitosamente' },
    });

  } catch (error) {
    logger.error('Error en change-password', error, {}, 'auth-change-password');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al cambiar contraseña',
      },
      { status: 500 }
    );
  }
}

