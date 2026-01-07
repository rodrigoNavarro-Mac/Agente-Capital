/**
 * =====================================================
 * API: Comisiones por Socio
 * =====================================================
 * Endpoint para obtener las comisiones que se deben cobrar a cada socio
 * (100% de fase venta + fase posventa)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getCommissionSales, getProductPartners, updatePartnerCommissionStatus } from '@/lib/commission-db';
import { calculatePartnerCommissionsForSale } from '@/lib/commission-calculator';
import { getCommissionConfig } from '@/lib/commission-db';
import type { APIResponse } from '@/types/documents';
import type { PartnerCommission, CommissionSalesFilters, CommissionConfig } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/partner-commissions
 * Obtiene las comisiones por socio
 * Query params: ?desarrollo=xxx&year=2024 (ambos opcionales)
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
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const desarrollo = searchParams.get('desarrollo');
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;

    // Obtener ventas comisionables con filtros
    const salesFilters: CommissionSalesFilters = {};
    if (desarrollo && desarrollo !== 'all') {
      salesFilters.desarrollo = desarrollo;
    }
    if (year) {
      // Para filtrar por año, usar fecha_firma_from y fecha_firma_to
      salesFilters.fecha_firma_from = `${year}-01-01`;
      salesFilters.fecha_firma_to = `${year}-12-31`;
    }

    const salesResult = await getCommissionSales(salesFilters, 1000, 0); // Obtener hasta 1000 ventas

    const sales = salesResult?.sales || [];

    // Calcular comisiones por socio para cada venta
    const allPartnerCommissions: PartnerCommission[] = [];

    for (const sale of sales) {
      // Obtener los partners asociados a esta venta
      const partners = await getProductPartners(sale.id);

      if (partners.length > 0) {
        // Obtener la configuración para este desarrollo
        const config: CommissionConfig | null = await getCommissionConfig(sale.desarrollo);

        if (config) {
          // Calcular comisiones para estos partners usando la configuración
          const partnerCommissions = calculatePartnerCommissionsForSale(sale, partners, {
            phase_sale_percent: config.phase_sale_percent,
            phase_post_sale_percent: config.phase_post_sale_percent,
          });

          // Agregar información adicional de la venta
          const enrichedCommissions = partnerCommissions.map(commission => ({
            ...commission,
            sale_info: {
              cliente_nombre: sale.cliente_nombre,
              desarrollo: sale.desarrollo,
              fecha_firma: sale.fecha_firma,
              producto: sale.producto || null,
              plazo_deal: sale.plazo_deal || null
            }
          }));

          allPartnerCommissions.push(...enrichedCommissions);
        } else {
          logger.warn(`No se encontró configuración para el desarrollo: ${sale.desarrollo}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: allPartnerCommissions,
      message: `Se calcularon ${allPartnerCommissions.length} comisiones de socios para ${sales.length} ventas`
    });
  } catch (error) {
    logger.error('Error obteniendo comisiones por socio', error, {}, 'commissions-partner-commissions');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo comisiones por socio',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/commissions/partner-commissions
 * Actualiza el estado de una comisión de socio
 * Body: { id: number, collection_status: 'pending_invoice' | 'invoiced' | 'collected' }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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
        { success: false, error: 'No tienes permisos para actualizar comisiones de socios' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, collection_status } = body;

    if (!id || !collection_status) {
      return NextResponse.json(
        { success: false, error: 'id y collection_status son requeridos' },
        { status: 400 }
      );
    }

    if (!['pending_invoice', 'invoiced', 'collected'].includes(collection_status)) {
      return NextResponse.json(
        { success: false, error: 'collection_status debe ser: pending_invoice, invoiced o collected' },
        { status: 400 }
      );
    }

    // Actualizar el estado
    await updatePartnerCommissionStatus(id, collection_status, payload.userId);

    return NextResponse.json({
      success: true,
      data: { id, collection_status },
      message: 'Estado de comisión actualizado correctamente'
    });

  } catch (error) {
    logger.error('Error actualizando estado de comisión de socio', error, {}, 'commissions-partner-commissions-patch');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando estado de comisión de socio',
      },
      { status: 500 }
    );
  }
}

