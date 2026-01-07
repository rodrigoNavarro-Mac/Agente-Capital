/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LOGIN ENDPOINT
 * =====================================================
 * Endpoint para autenticar usuarios
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, updateLastLogin, incrementFailedLoginAttempts, lockUserAccount } from '@/lib/postgres';
import { verifyPassword, generateAccessToken, generateRefreshToken } from '@/lib/auth';
import { validateRequest, loginRequestSchema } from '@/lib/validation';
import { createUserSession } from '@/lib/postgres';
import { logger } from '@/lib/logger';
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
    const rawBody = await request.json();
    const validation = validateRequest(loginRequestSchema, rawBody, 'auth-login');
    
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
        },
        { status: validation.status }
      );
    }
    
    const { email, password } = validation.data;

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
      logger.warn('Usuario no tiene contraseña configurada', { email }, 'auth-login');
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
      logger.warn('Contraseña inválida para usuario', { email }, 'auth-login');
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
    logger.error('Error en login', error, {}, 'auth-login');

    // Detectar errores específicos y proporcionar mensajes más claros
    const errorMessage = error instanceof Error ? error.message : String(error);
    let userMessage = 'Error al iniciar sesión';
    let statusCode = 500;
    
    // Error de circuit breaker abierto
    if (errorMessage.includes('Circuit breaker is OPEN')) {
      userMessage = 'El servicio está temporalmente no disponible. Por favor, espera unos momentos e intenta de nuevo.';
      statusCode = 503; // Service Unavailable
    } 
    // Error de configuración de base de datos
    else if (errorMessage.includes('Tenant or user not found') || 
             errorMessage.includes('password authentication failed') ||
             errorMessage.includes('authentication failed')) {
      userMessage = 'Error de conexión con la base de datos. Por favor, contacta al administrador del sistema.';
      statusCode = 503; // Service Unavailable
    }
    // Error de conexión
    else if (errorMessage.includes('Connection') || 
             errorMessage.includes('ECONNREFUSED') ||
             errorMessage.includes('ETIMEDOUT')) {
      userMessage = 'No se pudo conectar con el servidor. Por favor, intenta de nuevo en unos momentos.';
      statusCode = 503; // Service Unavailable
    }
    // Otros errores
    else {
      // En desarrollo, mostrar el error completo para debugging
      // En producción, mostrar mensaje genérico
      if (process.env.NODE_ENV === 'development') {
        userMessage = errorMessage;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: userMessage,
        // Solo incluir detalles técnicos en desarrollo
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: statusCode }
    );
  }
}

