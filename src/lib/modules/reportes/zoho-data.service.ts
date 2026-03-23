import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { ReporteData, FuenteLeads, MesHistorico } from './types';

const SCOPE = 'reportes:zoho-data';

function periodoToRange(periodo: string): { desde: string; hasta: string } {
  const [year, month] = periodo.split('-').map(Number);
  const desde = new Date(year, month - 1, 1);
  const hasta = new Date(year, month, 0, 23, 59, 59, 999);
  return {
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
  };
}

function getPeriodoAnterior(periodo: string): string {
  const [year, month] = periodo.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getLast6Months(periodo: string): string[] {
  const [year, month] = periodo.split('-').map(Number);
  const meses: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

// Condición de desarrollo robusta: columna directa (case-insensitive) o fallback JSONB
// Zoho tiene typo "Desarollo" en deals — se verifica ambas claves
// alias: prefijo de tabla opcional (ej: 'zd' → zd.desarrollo, zd.data->>'...')
function desarrolloCond(param: number, alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `(
    LOWER(TRIM(COALESCE(
      ${p}desarrollo,
      ${p}data->>'Desarrollo',
      ${p}data->>'Desarollo'
    ))) = LOWER(TRIM($${param}))
  )`;
}

export async function getReporteData(desarrollo: string, periodo: string): Promise<ReporteData> {
  const { desde, hasta } = periodoToRange(periodo);
  const periodoAnterior = getPeriodoAnterior(periodo);
  const { desde: desdeAnterior, hasta: hastaAnterior } = periodoToRange(periodoAnterior);

  logger.info('Calculando datos de reporte', { desarrollo, periodo }, SCOPE);

  // Total leads del período
  const leadsResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM zoho_leads
     WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3`,
    [desarrollo, desde, hasta]
  );
  const totalLeads = parseInt(leadsResult.rows[0]?.count ?? '0', 10);

  // Total leads mes anterior
  const leadsAntResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM zoho_leads
     WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3`,
    [desarrollo, desdeAnterior, hastaAnterior]
  );
  const totalLeadsMesAnterior = parseInt(leadsAntResult.rows[0]?.count ?? '0', 10);

  const variacionLeadsPct = totalLeadsMesAnterior === 0
    ? 0
    : Math.round(((totalLeads - totalLeadsMesAnterior) / totalLeadsMesAnterior) * 100);

  // Leads por fuente
  const fuentesResult = await query<{ fuente: string; cantidad: string }>(
    `SELECT COALESCE(lead_source, 'Sin fuente') as fuente, COUNT(*) as cantidad
     FROM zoho_leads
     WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3
     GROUP BY lead_source
     ORDER BY cantidad DESC`,
    [desarrollo, desde, hasta]
  );
  const leadsPorFuente: FuenteLeads[] = fuentesResult.rows.map(r => ({
    fuente: r.fuente,
    cantidad: parseInt(r.cantidad, 10),
    porcentaje: totalLeads > 0 ? Math.round((parseInt(r.cantidad, 10) / totalLeads) * 100) : 0,
  }));

  // Total visitas (leads que solicitaron visita en el período)
  const visitasResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM zoho_leads
     WHERE ${desarrolloCond(1)}
       AND created_time >= $2 AND created_time <= $3
       AND (
         data->>'Solicito_visita_cita' = 'true'
         OR data->>'solicito_visita_cita' = 'true'
       )`,
    [desarrollo, desde, hasta]
  );
  const totalVisitas = parseInt(visitasResult.rows[0]?.count ?? '0', 10);

  // Deals cerrados: usa fecha_firma de commission_sales (fecha real de firma)
  // Fallback a closing_date del deal si no tiene registro en commission_sales
  const cierresResult = await query<{ count: string; monto_total: string }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(zd.amount), 0) as monto_total
     FROM zoho_deals zd
     LEFT JOIN commission_sales cs ON cs.zoho_deal_id = zd.id
     WHERE ${desarrolloCond(1, 'zd')}
       AND COALESCE(cs.fecha_firma, zd.closing_date) >= $2::date
       AND COALESCE(cs.fecha_firma, zd.closing_date) <= $3::date
       AND (
         zd.stage ILIKE '%cerrad%'
         OR zd.stage ILIKE '%won%'
         OR zd.stage ILIKE '%ganad%'
         OR zd.stage ILIKE '%vendid%'
       )`,
    [desarrollo, desde, hasta]
  );
  const totalCierres = parseInt(cierresResult.rows[0]?.count ?? '0', 10);
  const montoTotalVentas = parseFloat(cierresResult.rows[0]?.monto_total ?? '0');

  // Tasas de conversión
  const tasaConversionLeadVisita = totalLeads > 0
    ? Math.round((totalVisitas / totalLeads) * 100)
    : 0;
  const tasaConversionVisitaCierre = totalVisitas > 0
    ? Math.round((totalCierres / totalVisitas) * 100)
    : 0;

  // Histórico últimos 6 meses
  const last6 = getLast6Months(periodo);
  const historico6Meses: MesHistorico[] = await Promise.all(
    last6.map(async (mes) => {
      const { desde: d, hasta: h } = periodoToRange(mes);
      const [lRes, vRes, cRes] = await Promise.all([
        query<{ count: string }>(
          `SELECT COUNT(*) as count FROM zoho_leads WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3`,
          [desarrollo, d, h]
        ),
        query<{ count: string }>(
          `SELECT COUNT(*) as count FROM zoho_leads WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3
           AND (data->>'Solicito_visita_cita' = 'true' OR data->>'solicito_visita_cita' = 'true')`,
          [desarrollo, d, h]
        ),
        query<{ count: string }>(
          `SELECT COUNT(*) as count
           FROM zoho_deals zd
           LEFT JOIN commission_sales cs ON cs.zoho_deal_id = zd.id
           WHERE ${desarrolloCond(1, 'zd')}
             AND COALESCE(cs.fecha_firma, zd.closing_date) >= $2::date
             AND COALESCE(cs.fecha_firma, zd.closing_date) <= $3::date
             AND (zd.stage ILIKE '%cerrad%' OR zd.stage ILIKE '%won%' OR zd.stage ILIKE '%ganad%' OR zd.stage ILIKE '%vendid%')`,
          [desarrollo, d, h]
        ),
      ]);
      return {
        mes,
        leads: parseInt(lRes.rows[0]?.count ?? '0', 10),
        visitas: parseInt(vRes.rows[0]?.count ?? '0', 10),
        cierres: parseInt(cRes.rows[0]?.count ?? '0', 10),
      };
    })
  );

  logger.info('Datos de reporte calculados', {
    desarrollo, periodo, totalLeads, totalVisitas, totalCierres,
  }, SCOPE);

  return {
    desarrollo,
    periodo,
    totalLeads,
    totalLeadsMesAnterior,
    variacionLeadsPct,
    leadsPorFuente,
    totalVisitas,
    totalCierres,
    montoTotalVentas,
    tasaConversionLeadVisita,
    tasaConversionVisitaCierre,
    historico6Meses,
  };
}
