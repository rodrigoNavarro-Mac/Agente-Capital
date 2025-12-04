/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - USERS API ENDPOINT
 * =====================================================
 * Endpoint para gestionar usuarios del sistema
 * GET: Listar todos los usuarios
 * POST: Crear un nuevo usuario
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllUsers, createUser, getUserByEmail } from '@/lib/postgres';
import { hashPassword, validatePasswordStrength } from '@/lib/auth';
import type { User, APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT GET - LISTAR USUARIOS
// =====================================================

export async function GET(): Promise<NextResponse<APIResponse<User[]>>> {
  try {
    const users = await getAllUsers();

    return NextResponse.json({
      success: true,
      data: users,
    });

  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo usuarios',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT POST - CREAR USUARIO
// =====================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<User>>> {
  try {
    const body = await request.json();
    const { email, name, role_id, password } = body;

    // Validar campos requeridos
    if (!email || !name || !role_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Los campos email, name y role_id son requeridos',
        },
        { status: 400 }
      );
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'El formato del email no es válido',
        },
        { status: 400 }
      );
    }

    // Verificar si el email ya existe
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Ya existe un usuario con este email',
        },
        { status: 409 }
      );
    }

    // Hashear contraseña si se proporciona
    let passwordHash: string | undefined;
    if (password) {
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
      passwordHash = await hashPassword(password);
    }

    // Crear el usuario
    await createUser(email, name, role_id, passwordHash);

    // Obtener el usuario completo con el rol
    const user = await getUserByEmail(email);

    return NextResponse.json(
      {
        success: true,
        data: user!,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('❌ Error creando usuario:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error creando usuario',
      },
      { status: 500 }
    );
  }
}

