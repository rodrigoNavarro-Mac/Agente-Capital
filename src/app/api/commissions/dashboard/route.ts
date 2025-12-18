/**
 * =====================================================
 * API: Dashboard de Comisiones
 * =====================================================
 * Endpoints para obtener datos del dashboard de comisiones
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { logger } from '@/lib/logger';
import type { APIResponse } from '@/types/documents';
import type {
  CommissionDevelopmentDashboard,
  CommissionGeneralDashboard,
} from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos para acceder al dashboard
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/dashboard
 * Obtiene datos del dashboard de comisiones
 * Query params: ?desarrollo=xxx&year=2024 (desarrollo es opcional)
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
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

    if (desarrollo) {
      // Dashboard por desarrollo
      const dashboard = await getDevelopmentDashboard(desarrollo, year);
      return NextResponse.json({
        success: true,
        data: dashboard,
      });
    } else {
      // Dashboard general (Capital Plus)
      const dashboard = await getGeneralDashboard(year);
      return NextResponse.json({
        success: true,
        data: dashboard,
      });
    }
  } catch (error) {
    logger.error('Error obteniendo dashboard de comisiones', error, {}, 'commissions-dashboard');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo dashboard',
      },
      { status: 500 }
    );
  }
}

/**
 * Obtiene el dashboard por desarrollo
 */
async function getDevelopmentDashboard(
  desarrollo: string,
  year: number
): Promise<CommissionDevelopmentDashboard> {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Obtener ventas del desarrollo en el año
  const salesResult = await query<{
    id: number;
    fecha_firma: string;
    propietario_deal: string;
    commission_total: number;
    asesor_externo: string | null;
  }>(
    `SELECT id, fecha_firma, propietario_deal, commission_total, asesor_externo
     FROM commission_sales
     WHERE desarrollo = $1
       AND EXTRACT(YEAR FROM fecha_firma) = $2
       AND commission_calculated = true
     ORDER BY fecha_firma`,
    [desarrollo, year]
  );

  const sales = salesResult.rows;

  // Obtener distribuciones
  const distributionsResult = await query<{
    sale_id: number;
    role_type: string;
    person_name: string;
    phase: string;
    amount_calculated: number;
  }>(
    `SELECT cd.sale_id, cd.role_type, cd.person_name, cd.phase, cd.amount_calculated
     FROM commission_distributions cd
     INNER JOIN commission_sales cs ON cd.sale_id = cs.id
     WHERE cs.desarrollo = $1
       AND EXTRACT(YEAR FROM cs.fecha_firma) = $2`,
    [desarrollo, year]
  );

  const _distributions = distributionsResult.rows;

  // Agrupar por mes
  const monthlyStats = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthSales = sales.filter(s => {
      const saleDate = new Date(s.fecha_firma);
      return saleDate.getMonth() + 1 === month;
    });

    const commissionTotal = monthSales.reduce((sum, s) => sum + Number(s.commission_total || 0), 0);
    
    // Comisión por propietario del deal
    const commissionByOwner: Record<string, number> = {};
    monthSales.forEach(sale => {
      const owner = sale.propietario_deal;
      if (!commissionByOwner[owner]) {
        commissionByOwner[owner] = 0;
      }
      commissionByOwner[owner] += Number(sale.commission_total || 0);
    });

    // Total anual por asesor (propietario del deal)
    const totalByAdvisor: Record<string, number> = {};
    monthSales.forEach(sale => {
      const advisor = sale.propietario_deal;
      if (!totalByAdvisor[advisor]) {
        totalByAdvisor[advisor] = 0;
      }
      totalByAdvisor[advisor] += Number(sale.commission_total || 0);
    });

    return {
      month,
      month_name: monthNames[i],
      commission_total: Number(commissionTotal.toFixed(2)),
      commission_by_owner: commissionByOwner,
      total_by_advisor: totalByAdvisor,
    };
  });

  // Totales anuales
  const totalAnnual = sales.reduce((sum, s) => sum + Number(s.commission_total || 0), 0);
  const totalByOwner: Record<string, number> = {};
  const totalByAdvisor: Record<string, number> = {};

  sales.forEach(sale => {
    const owner = sale.propietario_deal;
    if (!totalByOwner[owner]) {
      totalByOwner[owner] = 0;
    }
    totalByOwner[owner] += Number(sale.commission_total || 0);

    if (!totalByAdvisor[owner]) {
      totalByAdvisor[owner] = 0;
    }
    totalByAdvisor[owner] += Number(sale.commission_total || 0);
  });

  return {
    desarrollo,
    year,
    monthly_stats: monthlyStats,
    total_annual: Number(totalAnnual.toFixed(2)),
    total_by_owner: totalByOwner,
    total_by_advisor: totalByAdvisor,
  };
}

/**
 * Obtiene el dashboard general (Capital Plus)
 */
async function getGeneralDashboard(year: number): Promise<CommissionGeneralDashboard> {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Obtener todas las ventas del año
  const salesResult = await query<{
    id: number;
    fecha_firma: string;
    valor_total: number;
    commission_total: number;
  }>(
    `SELECT id, fecha_firma, valor_total, commission_total
     FROM commission_sales
     WHERE EXTRACT(YEAR FROM fecha_firma) = $1
       AND commission_calculated = true
     ORDER BY fecha_firma`,
    [year]
  );

  const sales = salesResult.rows;

  // Agrupar por mes
  const monthlyMetrics = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthSales = sales.filter(s => {
      const saleDate = new Date(s.fecha_firma);
      return saleDate.getMonth() + 1 === month;
    });

    const ventasTotales = monthSales.length;
    const unidadesVendidas = monthSales.length; // Asumiendo 1 unidad por venta
    const facturacionVentas = monthSales.reduce((sum, s) => sum + Number(s.valor_total || 0), 0);
    
    // Promedio de ticket de venta
    const ticketPromedio = ventasTotales > 0
      ? facturacionVentas / ventasTotales
      : 0;

    // Meta de facturación (por ahora null, se puede configurar después)
    const metaFacturacion: number | null = null;
    const porcentajeCumplimiento: number | null = metaFacturacion
      ? Number(((facturacionVentas / metaFacturacion) * 100).toFixed(2))
      : null;

    return {
      month,
      month_name: monthNames[i],
      ventas_totales: ventasTotales,
      unidades_vendidas: unidadesVendidas,
      facturacion_ventas: Number(facturacionVentas.toFixed(2)),
      ticket_promedio_venta: Number(ticketPromedio.toFixed(2)),
      meta_facturacion: metaFacturacion,
      porcentaje_cumplimiento: porcentajeCumplimiento,
    };
  });

  // Totales anuales
  const totalFacturacion = sales.reduce((sum, s) => sum + Number(s.valor_total || 0), 0);
  const totalAnnual = {
    ventas_totales: sales.length,
    unidades_vendidas: sales.length,
    facturacion_ventas: Number(totalFacturacion.toFixed(2)),
    ticket_promedio_venta: sales.length > 0
      ? Number((totalFacturacion / sales.length).toFixed(2))
      : 0,
  };

  // Obtener comisiones por desarrollo (agrupadas por mes)
  const commissionByDevelopmentResult = await query<{
    desarrollo: string;
    fecha_firma: string;
    commission_total: number;
  }>(
    `SELECT desarrollo, fecha_firma, commission_total
     FROM commission_sales
     WHERE EXTRACT(YEAR FROM fecha_firma) = $1
       AND commission_calculated = true
     ORDER BY desarrollo, fecha_firma`,
    [year]
  );

  const salesByDevelopment = commissionByDevelopmentResult.rows;

  // Agrupar comisiones por desarrollo y mes
  const commissionByDevelopment: Record<string, Record<number, number>> = {};
  salesByDevelopment.forEach(sale => {
    const desarrollo = sale.desarrollo;
    const month = new Date(sale.fecha_firma).getMonth() + 1;
    
    if (!commissionByDevelopment[desarrollo]) {
      commissionByDevelopment[desarrollo] = {};
    }
    if (!commissionByDevelopment[desarrollo][month]) {
      commissionByDevelopment[desarrollo][month] = 0;
    }
    commissionByDevelopment[desarrollo][month] += Number(sale.commission_total || 0);
  });

  // Obtener comisiones por vendedor (agrupadas por mes)
  // Los vendedores son los propietarios del deal (deal_owner)
  const commissionBySalespersonResult = await query<{
    propietario_deal: string;
    fecha_firma: string;
    amount_calculated: number;
  }>(
    `SELECT cs.propietario_deal, cs.fecha_firma, cd.amount_calculated
     FROM commission_distributions cd
     INNER JOIN commission_sales cs ON cd.sale_id = cs.id
     WHERE EXTRACT(YEAR FROM cs.fecha_firma) = $1
       AND cs.commission_calculated = true
       AND cd.role_type = 'deal_owner'
     ORDER BY cs.propietario_deal, cs.fecha_firma`,
    [year]
  );

  const distributionsBySalesperson = commissionBySalespersonResult.rows;

  // Agrupar comisiones por vendedor y mes
  const commissionBySalesperson: Record<string, Record<number, number>> = {};
  distributionsBySalesperson.forEach(dist => {
    const salesperson = dist.propietario_deal;
    const month = new Date(dist.fecha_firma).getMonth() + 1;
    
    if (!commissionBySalesperson[salesperson]) {
      commissionBySalesperson[salesperson] = {};
    }
    if (!commissionBySalesperson[salesperson][month]) {
      commissionBySalesperson[salesperson][month] = 0;
    }
    commissionBySalesperson[salesperson][month] += Number(dist.amount_calculated || 0);
  });

  return {
    year,
    monthly_metrics: monthlyMetrics,
    total_annual: totalAnnual,
    commission_by_development: commissionByDevelopment,
    commission_by_salesperson: commissionBySalesperson,
  };
}

