/**
 * =====================================================
 * API: Comisiones por Socio
 * =====================================================
 * Endpoint para obtener las comisiones que se deben cobrar a cada socio
 * (100% de fase venta + fase posventa)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { logger } from '@/lib/utils/logger';
import { getCommissionSales, getProductPartners, updatePartnerCommissionStatus, getPartnerCommissions, calculatePartnerCommissions } from '@/lib/db/commission-db';
import type { APIResponse } from '@/types/documents';
import type { CommissionSalesFilters } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/partner-commissions
 * Obtiene las comisiones por socio desde la base de datos
 * Query params: ?desarrollo=xxx&year=2024&collection_status=xxx (todos opcionales)
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
    const collectionStatus = searchParams.get('collection_status');
    const phase = searchParams.get('phase') as 'sale-phase' | 'post-sale-phase' | null;

    // Obtener ventas comisionables con filtros para asegurar que las comisiones estén calculadas
    const salesFilters: CommissionSalesFilters = {};
    if (desarrollo && desarrollo !== 'all') {
      salesFilters.desarrollo = desarrollo;
    }
    if (year) {
      salesFilters.fecha_firma_from = `${year}-01-01`;
      salesFilters.fecha_firma_to = `${year}-12-31`;
    }

    const salesResult = await getCommissionSales(salesFilters, 1000, 0);
    const sales = salesResult?.sales || [];

    // Calcular y guardar comisiones para cada venta que tenga socios pero no tenga comisiones calculadas
    for (const sale of sales) {
      const partners = await getProductPartners(sale.id);
      
      if (partners.length > 0) {
        // Verificar si ya existen comisiones calculadas para esta venta
        const existingCommissions = await getPartnerCommissions({
          commission_sale_id: sale.id
        });

        // Si no hay comisiones calculadas, calcularlas y guardarlas
        if (existingCommissions.length === 0) {
          try {
            await calculatePartnerCommissions(sale.id, payload.userId);
          } catch (error) {
            logger.warn(
              `Error calculando comisiones para venta ${sale.id}`,
              { error: error instanceof Error ? error.message : String(error) },
              'commissions-partner-commissions'
            );
            // Continuar con las demás ventas aunque falle una
          }
        }
      }
    }

    // Construir filtros para obtener las comisiones
    const filters: {
      desarrollo?: string;
      fecha_firma_from?: string;
      fecha_firma_to?: string;
      collection_status?: string;
      phase?: 'sale-phase' | 'post-sale-phase';
    } = {};

    if (desarrollo && desarrollo !== 'all') {
      filters.desarrollo = desarrollo;
    }

    if (year) {
      filters.fecha_firma_from = `${year}-01-01`;
      filters.fecha_firma_to = `${year}-12-31`;
    }

    if (collectionStatus && collectionStatus !== 'all') {
      filters.collection_status = collectionStatus;
    }

    if (phase) {
      filters.phase = phase;
    }

    logger.info('Filtros aplicados para partner commissions', {
      year,
      desarrollo,
      collectionStatus,
      phase,
      filters,
      fecha_firma_from: filters.fecha_firma_from,
      fecha_firma_to: filters.fecha_firma_to,
    }, 'commissions-partner-commissions');

    // Obtener comisiones desde la base de datos
    const allPartnerCommissions = await getPartnerCommissions(filters);

    logger.info('Comisiones obtenidas desde la base de datos', {
      total: allPartnerCommissions.length,
      sampleCommission: allPartnerCommissions[0] ? {
        id: allPartnerCommissions[0].id,
        commission_sale_id: allPartnerCommissions[0].commission_sale_id,
        socio_name: allPartnerCommissions[0].socio_name,
        sale_info: allPartnerCommissions[0].sale_info,
      } : null,
      phase,
      year,
    }, 'commissions-partner-commissions');

    return NextResponse.json({
      success: true,
      data: allPartnerCommissions,
      message: `Se obtuvieron ${allPartnerCommissions.length} comisiones de socios`
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
 * Actualiza el estado de una comisión de socio por fase
 * Body: { id: number, collection_status: 'pending_invoice' | 'invoiced' | 'collected', phase: 'sale_phase' | 'post_sale_phase' }
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
    const { id, collection_status, phase } = body;

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

    // Validar fase
    const validPhase = phase === 'post_sale_phase' ? 'post_sale_phase' : 'sale_phase';

    // Actualizar el estado por fase
    await updatePartnerCommissionStatus(id, collection_status, payload.userId, validPhase);

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




