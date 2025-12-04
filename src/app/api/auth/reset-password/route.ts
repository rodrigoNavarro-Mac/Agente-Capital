/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - RESET PASSWORD ENDPOINT
 * =====================================================
 * Endpoint para restablecer contraseña con token
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getPasswordResetToken, 
  markPasswordResetTokenAsUsed, 
  updateUserPassword,
  getUserById 
} from '@/lib/postgres';
import { hashPassword, validatePasswordStrength } from '@/lib/auth';
import type { APIResponse } from '@/types/documents';

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ message: string }>>> {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token y contraseña son requeridos',
        },
        { status: 400 }
      );
    }

    // Validar fortaleza de contraseña
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: passwordValidation.errors.join(', '),
        },
        { status: 400 }
      );
    }

    // Buscar token válido
    const resetToken = await getPasswordResetToken(token);

    if (!resetToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token inválido o expirado',
        },
        { status: 400 }
      );
    }

    // Verificar que el token no haya sido usado
    if (resetToken.used) {
      return NextResponse.json(
        {
          success: false,
          error: 'Este token ya fue utilizado',
        },
        { status: 400 }
      );
    }

    // Verificar que el token no haya expirado
    if (new Date(resetToken.expires_at) < new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token expirado',
        },
        { status: 400 }
      );
    }

    // Verificar que el usuario existe y está activo
    const user = await getUserById(resetToken.user_id);
    if (!user || !user.is_active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario no encontrado o inactivo',
        },
        { status: 404 }
      );
    }

    // Hashear nueva contraseña
    const passwordHash = await hashPassword(password);

    // Actualizar contraseña
    await updateUserPassword(resetToken.user_id, passwordHash);

    // Marcar token como usado
    await markPasswordResetTokenAsUsed(token);

    return NextResponse.json({
      success: true,
      data: { message: 'Contraseña restablecida exitosamente' },
    });

  } catch (error) {
    console.error('❌ Error en reset-password:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al restablecer contraseña',
      },
      { status: 500 }
    );
  }
}

