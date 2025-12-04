/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - CHAT HISTORY API ENDPOINT
 * =====================================================
 * Endpoint para obtener y eliminar el historial de chat de un usuario
 * filtrado por zona y desarrollo para mostrar conversaciones
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueryLogs, deleteQueryLogs, getUserById } from '@/lib/postgres';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import type { QueryLog, APIResponse, Zone } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER HISTORIAL DE CHAT
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<QueryLog[]>>> {
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

    const { searchParams } = new URL(request.url);
    
    // Parámetros requeridos
    const userIdParam = searchParams.get('userId');
    const zone = searchParams.get('zone') as Zone | null;
    const development = searchParams.get('development');
    
    // Parámetros opcionales
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    // Verificar si el usuario actual es admin o ceo
    const currentUser = await getUserById(payload.userId);
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'ceo';

    // Construir filtros
    const filters: {
      userId?: number;
      zone?: Zone;
      development?: string;
      limit: number;
      offset: number;
    } = {
      limit,
      offset,
    };

    // Manejar userId según permisos
    // IMPORTANTE: Los usuarios normales SIEMPRE ven solo sus propios chats
    // Los administradores pueden ver todos o filtrar por usuario específico
    if (isAdmin) {
      // Admin puede ver todos los chats o filtrar por usuario específico
      if (userIdParam) {
        const requestedUserId = parseInt(userIdParam);
        if (!isNaN(requestedUserId)) {
          filters.userId = requestedUserId;
          console.log(`👑 [ADMIN] Filtrando historial por userId: ${requestedUserId}`);
        }
      } else {
        console.log(`👑 [ADMIN] Sin filtro de userId - retornando TODOS los chats`);
      }
      // Si no se especifica userId, admin ve todos los chats (userId undefined)
    } else {
      // Usuario normal SIEMPRE ve solo sus propios chats, ignorando completamente el parámetro userId
      // FORZAR el userId del token para usuarios normales
      filters.userId = payload.userId;
      
      // Si intentó especificar otro userId, ignorarlo silenciosamente por seguridad
      if (userIdParam) {
        const requestedUserId = parseInt(userIdParam);
        if (!isNaN(requestedUserId) && requestedUserId !== payload.userId) {
          console.log(`⚠️ [SEGURIDAD] Usuario ${payload.userId} (${currentUser?.email}) intentó ver historial de usuario ${requestedUserId}, usando su propio ID`);
        }
      }
      
      console.log(`👤 [USUARIO] Forzando filtro por userId: ${payload.userId} (ignorando parámetro userId del request)`);
    }
    
    console.log(`📋 [chat-history] Obteniendo historial - Usuario autenticado: ${payload.userId} (${currentUser?.email}), Rol: ${currentUser?.role}, Filtro userId aplicado: ${filters.userId !== undefined ? filters.userId : 'NINGUNO (todos)'}, Zona: ${zone || 'TODAS'}, Desarrollo: ${development || 'TODOS'}`);

    // Agregar filtros opcionales
    if (zone) {
      filters.zone = zone;
    }
    if (development) {
      filters.development = development;
    }

    // Obtener logs de consultas (historial de chat)
    const queryLogs = await getQueryLogs(filters);

    // Ordenar por fecha (más reciente primero)
    const sortedLogs = queryLogs.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // Orden descendente (más reciente primero)
    });

    return NextResponse.json({
      success: true,
      data: sortedLogs,
    });

  } catch (error) {
    console.error('❌ Error obteniendo historial de chat:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo historial de chat',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// ENDPOINT DELETE - ELIMINAR HISTORIAL DE CHAT
// =====================================================

export async function DELETE(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ deletedCount: number }>>> {
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

    const { searchParams } = new URL(request.url);
    
    // Parámetros requeridos
    const userIdParam = searchParams.get('userId');
    const zone = searchParams.get('zone') as Zone | null;
    const development = searchParams.get('development');

    // Validar parámetros requeridos
    if (!userIdParam) {
      return NextResponse.json(
        {
          success: false,
          error: 'El parámetro userId es requerido',
        },
        { status: 400 }
      );
    }

    const requestedUserId = parseInt(userIdParam);

    // Verificar si el usuario actual es admin o ceo
    const currentUser = await getUserById(payload.userId);
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'ceo';

    // Si no es admin, solo puede eliminar sus propios chats
    if (!isAdmin && requestedUserId !== payload.userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para eliminar el historial de otros usuarios',
        },
        { status: 403 }
      );
    }

    // Eliminar logs de consultas
    // Si es admin, puede eliminar cualquier historial
    // Si no es admin, solo puede eliminar el suyo
    const deletedCount = await deleteQueryLogs({
      userId: requestedUserId,
      zone: zone || undefined,
      development: development || undefined,
    });

    return NextResponse.json({
      success: true,
      data: { deletedCount },
      message: `Se eliminaron ${deletedCount} mensaje(s) del historial`,
    });

  } catch (error) {
    console.error('❌ Error eliminando historial de chat:', error);

    // Si el error es sobre admin, retornar 403
    if (error instanceof Error && error.message.includes('administradores no pueden')) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error eliminando historial de chat',
      },
      { status: 500 }
    );
  }
}

