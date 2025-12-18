/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - USER BY ID API ENDPOINT
 * =====================================================
 * Endpoint para gestionar un usuario específico
 * GET: Obtener usuario por ID
 * PUT: Actualizar usuario
 * DELETE: Desactivar usuario
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUser, deactivateUser, getUserByEmail } from '@/lib/postgres';
import { logger } from '@/lib/logger';
import { validateRequest, updateUserRequestSchema } from '@/lib/validation';
import type { User, APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER USUARIO POR ID
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<User>>> {
  try {
    const userId = parseInt(params.id);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID de usuario inválido',
        },
        { status: 400 }
      );
    }

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
    logger.error('Error obteniendo usuario', error, {}, 'users');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo usuario',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT PUT - ACTUALIZAR USUARIO
// =====================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<User>>> {
  try {
    const userId = parseInt(params.id);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID de usuario inválido',
        },
        { status: 400 }
      );
    }

    const rawBody = await request.json();
    const validation = validateRequest(updateUserRequestSchema, rawBody, 'users');
    
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
        },
        { status: validation.status }
      );
    }
    
    const { email, name, role_id, is_active } = validation.data;

    // Validar que el usuario existe
    const existingUser = await getUserById(userId);
    if (!existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario no encontrado',
        },
        { status: 404 }
      );
    }

    // Verificar si el email ya está en uso por otro usuario
    if (email) {
      const userWithEmail = await getUserByEmail(email);
      if (userWithEmail && userWithEmail.id !== userId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Ya existe otro usuario con este email',
          },
          { status: 409 }
        );
      }
    }

    // Preparar actualizaciones
    const updates: {
      email?: string;
      name?: string;
      role_id?: number;
      is_active?: boolean;
    } = {};

    if (email !== undefined) updates.email = email;
    if (name !== undefined) updates.name = name;
    if (role_id !== undefined) updates.role_id = role_id;
    if (is_active !== undefined) updates.is_active = is_active;

    // Actualizar usuario
    const updatedUser = await updateUser(userId, updates);

    if (!updatedUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Error al actualizar el usuario',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedUser,
    });

  } catch (error) {
    logger.error('Error actualizando usuario', error, {}, 'users');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando usuario',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT DELETE - DESACTIVAR USUARIO
// =====================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<{ message: string }>>> {
  try {
    const userId = parseInt(params.id);

    if (isNaN(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID de usuario inválido',
        },
        { status: 400 }
      );
    }

    // Verificar que el usuario existe
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

    // No permitir desactivar al usuario admin por defecto
    if (user.email === 'admin@capitalplus.com') {
      return NextResponse.json(
        {
          success: false,
          error: 'No se puede desactivar al usuario administrador principal',
        },
        { status: 403 }
      );
    }

    // Desactivar usuario
    const success = await deactivateUser(userId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Error al desactivar el usuario',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Usuario desactivado correctamente' },
    });

  } catch (error) {
    logger.error('Error desactivando usuario', error, {}, 'users');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desactivando usuario',
      },
      { status: 500 }
    );
  }
}

