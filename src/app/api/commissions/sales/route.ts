/**
 * =====================================================
 * API: Ventas Comisionables
 * =====================================================
 * Endpoints para gestionar ventas comisionables (deals cerrados-ganados)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import {
  getCommissionSales,
  getCommissionSale,
  upsertCommissionSale,
} from '@/lib/commission-db';
import type { APIResponse } from '@/types/documents';
import type { CommissionSaleInput, CommissionSalesFilters } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos para acceder a ventas comisionables
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/sales
 * Obtiene ventas comisionables con filtros opcionales
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
    const id = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (id) {
      // Obtener venta específica
      const sale = await getCommissionSale(parseInt(id, 10));
      return NextResponse.json({
        success: true,
        data: sale,
      });
    }

    // Construir filtros
    const filters: CommissionSalesFilters = {};
    if (searchParams.get('desarrollo')) {
      filters.desarrollo = searchParams.get('desarrollo')!;
    }
    if (searchParams.get('propietario_deal')) {
      filters.propietario_deal = searchParams.get('propietario_deal')!;
    }
    if (searchParams.get('fecha_firma_from')) {
      filters.fecha_firma_from = searchParams.get('fecha_firma_from')!;
    }
    if (searchParams.get('fecha_firma_to')) {
      filters.fecha_firma_to = searchParams.get('fecha_firma_to')!;
    }
    if (searchParams.get('commission_calculated')) {
      filters.commission_calculated = searchParams.get('commission_calculated') === 'true';
    }

    const result = await getCommissionSales(filters, limit, offset);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error obteniendo ventas comisionables:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo ventas',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commissions/sales
 * Crea o actualiza una venta comisionable
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
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const saleInput: CommissionSaleInput = body;

    // Validar campos requeridos
    if (!saleInput.zoho_deal_id || !saleInput.cliente_nombre || !saleInput.desarrollo ||
        !saleInput.propietario_deal || !saleInput.metros_cuadrados || !saleInput.valor_total ||
        !saleInput.fecha_firma) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Validar que metros cuadrados y valor total sean positivos
    if (saleInput.metros_cuadrados <= 0 || saleInput.valor_total <= 0) {
      return NextResponse.json(
        { success: false, error: 'Metros cuadrados y valor total deben ser mayores a 0' },
        { status: 400 }
      );
    }

    // Calcular precio por m² si no se proporciona
    if (!saleInput.precio_por_m2 || saleInput.precio_por_m2 === 0) {
      saleInput.precio_por_m2 = Number((saleInput.valor_total / saleInput.metros_cuadrados).toFixed(2));
    }

    const sale = await upsertCommissionSale(saleInput);

    return NextResponse.json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error('Error guardando venta comisionable:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error guardando venta',
      },
      { status: 500 }
    );
  }
}

