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
import { logger } from '@/lib/logger';
import { validateRequest, commissionSaleInputSchema } from '@/lib/validation';
import type { APIResponse } from '@/types/documents';
import type { CommissionSalesFilters, CommissionSaleInput } from '@/types/commissions';

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
    logger.error('Error obteniendo ventas comisionables', error, {}, 'commissions-sales');
    
    // Detectar errores específicos y proporcionar mensajes más claros
    const errorMessage = error instanceof Error ? error.message : String(error);
    let userMessage = 'Error obteniendo ventas comisionables';
    let statusCode = 500;
    
    if (errorMessage.includes('Circuit breaker is OPEN')) {
      userMessage = 'La base de datos está temporalmente no disponible. Por favor, intenta de nuevo en unos momentos.';
      statusCode = 503; // Service Unavailable
    } else if (errorMessage.includes('Tenant or user not found')) {
      userMessage = 'Error de configuración de la base de datos. Contacta al administrador del sistema.';
      statusCode = 500;
    }
    
    return NextResponse.json(
      {
        success: false,
        error: userMessage,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: statusCode }
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

    const rawBody = await request.json();
    const validation = validateRequest(commissionSaleInputSchema, rawBody, 'commissions-sales');
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }
    
    const saleInput = validation.data;

    // Calcular precio por m² si no se proporciona
    const precioPorM2 = saleInput.precio_por_m2 && saleInput.precio_por_m2 > 0
      ? saleInput.precio_por_m2
      : Number((saleInput.valor_total / saleInput.metros_cuadrados).toFixed(2));

    // Crear objeto con el tipo correcto (precio_por_m2 siempre presente)
    const saleInputWithPrice: CommissionSaleInput = {
      ...saleInput,
      precio_por_m2: precioPorM2,
    };

    const sale = await upsertCommissionSale(saleInputWithPrice);

    return NextResponse.json({
      success: true,
      data: sale,
    });
  } catch (error) {
    logger.error('Error guardando venta comisionable', error, {}, 'commissions-sales');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error guardando venta',
      },
      { status: 500 }
    );
  }
}

