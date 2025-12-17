/**
 * =====================================================
 * API: Dashboard de Comisiones
 * =====================================================
 * Endpoints para obtener datos del dashboard de comisiones
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { query } from '@/lib/postgres';
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
    console.error('Error obteniendo dashboard de comisiones:', error);
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

  const distributions = distributionsResult.rows;

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
    
    // Mediana de ticket de venta
    const tickets = monthSales.map(s => Number(s.valor_total || 0)).sort((a, b) => a - b);
    const medianaTicket = tickets.length > 0
      ? tickets.length % 2 === 0
        ? (tickets[tickets.length / 2 - 1] + tickets[tickets.length / 2]) / 2
        : tickets[Math.floor(tickets.length / 2)]
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
      mediana_ticket_venta: Number(medianaTicket.toFixed(2)),
      meta_facturacion: metaFacturacion,
      porcentaje_cumplimiento: porcentajeCumplimiento,
    };
  });

  // Totales anuales
  const totalAnnual = {
    ventas_totales: sales.length,
    unidades_vendidas: sales.length,
    facturacion_ventas: Number(sales.reduce((sum, s) => sum + Number(s.valor_total || 0), 0).toFixed(2)),
    mediana_ticket_venta: (() => {
      const tickets = sales.map(s => Number(s.valor_total || 0)).sort((a, b) => a - b);
      return tickets.length > 0
        ? tickets.length % 2 === 0
          ? (tickets[tickets.length / 2 - 1] + tickets[tickets.length / 2]) / 2
          : tickets[Math.floor(tickets.length / 2)]
        : 0;
    })(),
  };

  return {
    year,
    monthly_metrics: monthlyMetrics,
    total_annual: totalAnnual,
  };
}

