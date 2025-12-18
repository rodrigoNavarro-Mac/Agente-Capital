/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ADMIN CHANGE USER PASSWORD
 * =====================================================
 * Endpoint para que el admin cambie la contraseña de un usuario
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUserPassword } from '@/lib/postgres';
import { hashPassword, validatePasswordStrength, extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { hasPermission } from '@/lib/postgres';
import { logger } from '@/lib/logger';
import { validateRequest, adminChangePasswordRequestSchema } from '@/lib/validation';
import type { APIResponse } from '@/types/documents';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    // Validar ID del usuario objetivo
    const targetUserId = parseInt(params.id);
    if (isNaN(targetUserId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID de usuario inválido',
        },
        { status: 400 }
      );
    }

    // Parsear y validar el body
    const rawBody = await request.json();
    const validation = validateRequest(adminChangePasswordRequestSchema, rawBody, 'users-change-password');
    
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
        },
        { status: validation.status }
      );
    }
    
    const { password } = validation.data;

    // Verificar permisos (solo admin puede cambiar contraseñas de otros)
    // Primero verificar si es admin por rol
    const currentUser = await getUserById(payload.userId);
    
    // Verificar que el usuario actual existe
    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario no encontrado',
        },
        { status: 404 }
      );
    }
    
    // Verificar si es admin o CEO por rol
    const isAdmin = currentUser.role === 'admin' || currentUser.role === 'ceo';
    
    // Si no es admin, verificar permiso específico
    const canManageUsers = isAdmin || await hasPermission(payload.userId, 'manage_users');
    
    // Si no tiene permisos y no está cambiando su propia contraseña, denegar
    if (!canManageUsers && payload.userId !== targetUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para cambiar contraseñas de otros usuarios',
        },
        { status: 403 }
      );
    }

    // Validar que el usuario objetivo existe
    const user = await getUserById(targetUserId);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario objetivo no encontrado',
        },
        { status: 404 }
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          error: 'La contraseña es requerida',
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

    // Hashear contraseña
    const passwordHash = await hashPassword(password);

    // Actualizar contraseña
    await updateUserPassword(targetUserId, passwordHash);

    // TODO: Si sendEmail es true, enviar email al usuario notificando el cambio

    return NextResponse.json({
      success: true,
      data: { message: 'Contraseña actualizada exitosamente' },
    });

  } catch (error) {
    logger.error('Error cambiando contraseña', error, {}, 'users-change-password');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al cambiar contraseña',
      },
      { status: 500 }
    );
  }
}

