/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LOGIN ENDPOINT
 * =====================================================
 * Endpoint para autenticar usuarios
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, updateLastLogin, incrementFailedLoginAttempts, lockUserAccount } from '@/lib/postgres';
import { verifyPassword, generateAccessToken, generateRefreshToken, validateEmail } from '@/lib/auth';
import { createUserSession } from '@/lib/postgres';
import type { APIResponse } from '@/types/documents';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{
  user: {
    id: number;
    email: string;
    name: string;
    role?: string;
  };
  accessToken: string;
  refreshToken: string;
}>>> {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validar campos requeridos
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email y contraseña son requeridos',
        },
        { status: 400 }
      );
    }

    // Validar formato de email
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

    if (!user) {
      // No revelar si el usuario existe o no por seguridad
      return NextResponse.json(
        {
          success: false,
          error: 'Credenciales inválidas',
        },
        { status: 401 }
      );
    }

    // Verificar si la cuenta está activa
    if (!user.is_active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tu cuenta está desactivada. Contacta al administrador.',
        },
        { status: 403 }
      );
    }

    // Verificar si la cuenta está bloqueada
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockedUntil = new Date(user.locked_until);
      const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        {
          success: false,
          error: `Tu cuenta está bloqueada. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        },
        { status: 423 }
      );
    }

    // Verificar si tiene contraseña
    if (!user.password_hash) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tu cuenta no tiene contraseña configurada. Contacta al administrador.',
        },
        { status: 403 }
      );
    }

    // Verificar contraseña
    if (!user.password_hash) {
      console.log(`Usuario ${email} no tiene contraseña configurada`);
      return NextResponse.json(
        {
          success: false,
          error: 'Tu cuenta no tiene contraseña configurada. Contacta al administrador.',
        },
        { status: 403 }
      );
    }

    const passwordValid = await verifyPassword(password, user.password_hash);

    if (!passwordValid) {
      console.log(`Contraseña inválida para usuario: ${email}`);
      // Incrementar intentos fallidos
      await incrementFailedLoginAttempts(user.id);

      // Obtener usuario actualizado para verificar intentos
      const updatedUser = await getUserByEmail(email);
      
      if (updatedUser && (updatedUser.failed_login_attempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
        await lockUserAccount(user.id, LOCKOUT_MINUTES);
        return NextResponse.json(
          {
            success: false,
            error: `Demasiados intentos fallidos. Tu cuenta ha sido bloqueada por ${LOCKOUT_MINUTES} minutos.`,
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Credenciales inválidas',
        },
        { status: 401 }
      );
    }

    // Login exitoso - actualizar último login
    await updateLastLogin(user.id);

    // Generar tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Crear sesión
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 días

    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    await createUserSession(
      user.id,
      accessToken,
      refreshToken,
      expiresAt,
      ipAddress,
      userAgent
    );

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });

  } catch (error) {
    console.error('❌ Error en login:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al iniciar sesión',
      },
      { status: 500 }
    );
  }
}

