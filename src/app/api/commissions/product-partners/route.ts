/**
 * =====================================================
 * API: Socios del Producto
 * =====================================================
 * Endpoint para obtener los socios del producto relacionado con un deal
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getProductPartners, getProductPartnersForSales } from '@/lib/db/commission-db';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/product-partners
 * Obtiene los socios del producto relacionado con un deal
 * Query params: deal_id (ID del deal en Zoho) o sale_id (ID de la venta comisionable)
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
    const saleId = searchParams.get('sale_id');
    const saleIdsParam = searchParams.get('sale_ids'); // Para carga en batch

    // Si se proporciona sale_ids (array), cargar múltiples ventas en batch
    if (saleIdsParam) {
      try {
        const saleIds = JSON.parse(saleIdsParam) as number[];
        if (!Array.isArray(saleIds) || saleIds.length === 0) {
          return NextResponse.json(
            { success: false, error: 'sale_ids debe ser un array no vacío' },
            { status: 400 }
          );
        }

        // Obtener socios para múltiples ventas en una sola consulta
        const partnersMap = await getProductPartnersForSales(saleIds);

        // Formatear la respuesta: objeto con sale_id como clave
        const formattedResponse: Record<number, Array<{ socio: string; participacion: number }>> = {};
        for (const [saleIdStr, partners] of Object.entries(partnersMap)) {
          const saleIdNum = parseInt(saleIdStr, 10);
          formattedResponse[saleIdNum] = partners.map(p => ({
            socio: p.socio_name,
            participacion: Number(p.participacion),
          }));
        }

        return NextResponse.json({
          success: true,
          data: formattedResponse,
        });
      } catch {
        return NextResponse.json(
          { success: false, error: 'Formato inválido de sale_ids. Debe ser un array JSON.' },
          { status: 400 }
        );
      }
    }

    // Carga individual (comportamiento original)
    if (!saleId) {
      return NextResponse.json(
        { success: false, error: 'Se requiere sale_id o sale_ids' },
        { status: 400 }
      );
    }

    // Obtener socios del producto desde la base de datos
    const partners = await getProductPartners(parseInt(saleId, 10));

    // Formatear la respuesta para que coincida con el formato esperado por el frontend
    const formattedPartners = partners.map(p => ({
      socio: p.socio_name,
      participacion: Number(p.participacion),
    }));

    return NextResponse.json({
      success: true,
      data: formattedPartners,
    });
  } catch (error) {
    logger.error('Error obteniendo socios del producto', error, {}, 'commissions-product-partners');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo socios del producto',
      },
      { status: 500 }
    );
  }
}




