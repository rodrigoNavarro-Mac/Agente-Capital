/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - FORGOT PASSWORD ENDPOINT
 * =====================================================
 * Endpoint para solicitar recuperación de contraseña
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createPasswordResetToken } from '@/lib/postgres';
import { generateResetToken, getResetTokenExpiry, validateEmail } from '@/lib/auth';
import type { APIResponse } from '@/types/documents';

// TODO: Configurar nodemailer para enviar emails
// Por ahora solo creamos el token

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ message: string }>>> {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: 'El email es requerido',
        },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'El formato del email no es válido',
        },
        { status: 400 }
      );
    }

    // Buscar usuario
    const user = await getUserByEmail(email);

    // Por seguridad, siempre retornamos éxito aunque el usuario no exista
    if (!user || !user.is_active) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'Si el email existe, recibirás un enlace para recuperar tu contraseña',
        },
      });
    }

    // Generar token de recuperación
    const token = generateResetToken();
    const expiresAt = getResetTokenExpiry();

    // Guardar token en la base de datos
    await createPasswordResetToken(user.id, token, expiresAt);

    // TODO: Enviar email con el token
    // const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
    // await sendPasswordResetEmail(user.email, resetUrl);

    console.log(`🔐 Token de recuperación generado para ${email}: ${token}`);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Si el email existe, recibirás un enlace para recuperar tu contraseña',
      },
    });

  } catch (error) {
    console.error('❌ Error en forgot-password:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar la solicitud',
      },
      { status: 500 }
    );
  }
}

