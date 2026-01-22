/**
 * =====================================================
 * API: Eventos de Zoho Projects
 * =====================================================
 * Endpoint para procesar eventos emitidos por Zoho Projects
 * Actualmente solo maneja POST_SALE_TRIGGER
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { logger } from '@/lib/utils/logger';
import { processZohoProjectsEvent } from '@/lib/db/commission-db';
import type { APIResponse } from '@/types/documents';
import type { ZohoProjectsEventInput } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos (solo admin/ceo pueden procesar eventos de Zoho)
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * POST /api/commissions/zoho-projects
 * Procesa un evento emitido por Zoho Projects
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para procesar eventos de Zoho Projects' },
        { status: 403 }
      );
    }

    // Parsear el body
    const eventData: ZohoProjectsEventInput = await request.json();

    // Validar datos requeridos
    if (!eventData.event_type) {
      return NextResponse.json(
        { success: false, error: 'event_type es requerido' },
        { status: 400 }
      );
    }

    // Solo permitir POST_SALE_TRIGGER por ahora
    if (eventData.event_type !== 'post_sale_trigger') {
      return NextResponse.json(
        { success: false, error: 'Tipo de evento no soportado. Solo se permite: post_sale_trigger' },
        { status: 400 }
      );
    }

    // Para POST_SALE_TRIGGER, se requiere commission_sale_id
    if (eventData.event_type === 'post_sale_trigger' && !eventData.commission_sale_id) {
      return NextResponse.json(
        { success: false, error: 'commission_sale_id es requerido para POST_SALE_TRIGGER' },
        { status: 400 }
      );
    }

    // Procesar el evento
    const result = await processZohoProjectsEvent(eventData, payload.userId);

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Evento de Zoho Projects procesado correctamente'
    });

  } catch (error) {
    logger.error('Error procesando evento de Zoho Projects', error, {}, 'zoho-projects-events');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error procesando evento de Zoho Projects',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/commissions/zoho-projects
 * Obtiene el historial de eventos de Zoho Projects
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para ver eventos de Zoho Projects' },
        { status: 403 }
      );
    }

    // TODO: Implementar consulta de eventos
    // Por ahora retornar array vacío
    return NextResponse.json({
      success: true,
      data: [],
      message: 'Historial de eventos de Zoho Projects (pendiente de implementar)'
    });

  } catch (error) {
    logger.error('Error obteniendo eventos de Zoho Projects', error, {}, 'zoho-projects-events-get');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo eventos de Zoho Projects',
      },
      { status: 500 }
    );
  }
}



