/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - PAGE VISITS ENDPOINT
 * =====================================================
 * Endpoint para registrar visitas a páginas/módulos
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { recordPageVisit, getActiveSessionByToken } from '@/lib/postgres';
import { logger } from '@/lib/logger';
import type { APIResponse } from '@/types/documents';

/**
 * POST /api/page-visits
 * Registra una visita a una página/módulo
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse>> {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }

    // Obtener datos del body
    const body = await request.json();
    const { page_path, page_name, module_name } = body;

    if (!page_path) {
      return NextResponse.json(
        { success: false, error: 'page_path es requerido' },
        { status: 400 }
      );
    }

    // Obtener IP y User Agent
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     request.ip ||
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Obtener sesión activa si existe
    const session = await getActiveSessionByToken(token);
    const sessionId = session?.id;

    // Registrar la visita
    await recordPageVisit({
      user_id: payload.userId,
      session_id: sessionId,
      page_path,
      page_name: page_name || null,
      module_name: module_name || null,
      ip_address: ipAddress.split(',')[0].trim(), // Tomar la primera IP si hay múltiples
      user_agent: userAgent,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error('Error registrando visita a página', error, {}, 'page-visits');
    return NextResponse.json(
      {
        success: false,
        error: 'Error al registrar visita',
      },
      { status: 500 }
    );
  }
}



