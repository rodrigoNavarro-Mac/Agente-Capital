/**
 * =====================================================
 * API: Facturas de Socios
 * =====================================================
 * Endpoint para gestionar facturas emitidas a socios
 * por comisiones (flujo de ingresos)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { createPartnerInvoice } from '@/lib/commission-db';
import type { APIResponse } from '@/types/documents';
import type { PartnerInvoiceInput } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/partner-invoices
 * Obtiene facturas de socios
 * Query params: ?partner_commission_id=xxx (opcional)
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
        { success: false, error: 'No tienes permisos para ver facturas de socios' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const partnerCommissionId = searchParams.get('partner_commission_id');

    // TODO: Implementar consulta de facturas
    // Por ahora retornar array vacío
    return NextResponse.json({
      success: true,
      data: partnerCommissionId ? [] : [], // Filtrar por comisión si se especifica
      message: 'Consulta de facturas de socios (pendiente de implementar)'
    });

  } catch (error) {
    logger.error('Error obteniendo facturas de socios', error, {}, 'partner-invoices-get');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo facturas de socios',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commissions/partner-invoices
 * Crea una nueva factura para un socio
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
        { success: false, error: 'No tienes permisos para crear facturas de socios' },
        { status: 403 }
      );
    }

    // Parsear el body
    const invoiceData: PartnerInvoiceInput = await request.json();

    // Validar datos requeridos
    if (!invoiceData.partner_commission_id) {
      return NextResponse.json(
        { success: false, error: 'partner_commission_id es requerido' },
        { status: 400 }
      );
    }

    if (!invoiceData.invoice_date) {
      return NextResponse.json(
        { success: false, error: 'invoice_date es requerido' },
        { status: 400 }
      );
    }

    if (!invoiceData.invoice_amount || invoiceData.invoice_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'invoice_amount debe ser mayor a 0' },
        { status: 400 }
      );
    }

    // Crear la factura
    const result = await createPartnerInvoice(invoiceData, payload.userId);

    return NextResponse.json({
      success: true,
      data: { invoice_id: result.invoice_id },
      message: 'Factura creada correctamente'
    });

  } catch (error) {
    logger.error('Error creando factura para socio', error, {}, 'partner-invoices-post');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error creando factura para socio',
      },
      { status: 500 }
    );
  }
}
