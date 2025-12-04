/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - USER DEVELOPMENTS API
 * =====================================================
 * Endpoint para gestionar desarrollos de un usuario
 * GET: Obtener desarrollos del usuario
 * POST: Asignar desarrollo al usuario
 * PUT: Actualizar permisos de desarrollo
 * DELETE: Remover desarrollo del usuario
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getUserDevelopments, 
  assignUserDevelopment, 
  updateUserDevelopment,
  removeUserDevelopment,
  getUserById 
} from '@/lib/postgres';
import type { UserDevelopment, APIResponse, Zone } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER DESARROLLOS DEL USUARIO
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<UserDevelopment[]>>> {
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

    const developments = await getUserDevelopments(userId);

    return NextResponse.json({
      success: true,
      data: developments,
    });

  } catch (error) {
    console.error('❌ Error obteniendo desarrollos del usuario:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo desarrollos',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT POST - ASIGNAR DESARROLLO AL USUARIO
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<UserDevelopment>>> {
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

    const body = await request.json();
    const { zone, development, can_upload, can_query } = body;

    // Validar campos requeridos
    if (!zone || !development) {
      return NextResponse.json(
        {
          success: false,
          error: 'Los campos zone y development son requeridos',
        },
        { status: 400 }
      );
    }

    // Asignar desarrollo
    const userDevelopment = await assignUserDevelopment(
      userId,
      zone as Zone,
      development,
      can_upload ?? false,
      can_query ?? true
    );

    return NextResponse.json(
      {
        success: true,
        data: userDevelopment,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('❌ Error asignando desarrollo:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error asignando desarrollo',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT PUT - ACTUALIZAR PERMISOS DE DESARROLLO
// =====================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<APIResponse<UserDevelopment>>> {
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

    const body = await request.json();
    const { zone, development, can_upload, can_query } = body;

    // Validar campos requeridos
    if (!zone || !development || can_upload === undefined || can_query === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Los campos zone, development, can_upload y can_query son requeridos',
        },
        { status: 400 }
      );
    }

    // Actualizar permisos
    const updated = await updateUserDevelopment(
      userId,
      zone as Zone,
      development,
      can_upload,
      can_query
    );

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se encontró el desarrollo asignado al usuario',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });

  } catch (error) {
    console.error('❌ Error actualizando permisos de desarrollo:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando permisos',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT DELETE - REMOVER DESARROLLO DEL USUARIO
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

    const { searchParams } = new URL(request.url);
    const zone = searchParams.get('zone');
    const development = searchParams.get('development');

    if (!zone || !development) {
      return NextResponse.json(
        {
          success: false,
          error: 'Los parámetros zone y development son requeridos',
        },
        { status: 400 }
      );
    }

    // Remover desarrollo
    const success = await removeUserDevelopment(
      userId,
      zone as Zone,
      development
    );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se encontró el desarrollo asignado al usuario',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Desarrollo removido correctamente' },
    });

  } catch (error) {
    console.error('❌ Error removiendo desarrollo:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error removiendo desarrollo',
      },
      { status: 500 }
    );
  }
}

