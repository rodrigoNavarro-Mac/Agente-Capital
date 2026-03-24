import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type {
  ReporteData, FuenteLeads, MesHistorico,
  MotivoDescarte, DescartesSemanal, CierreDetalle,
} from './types';

const SCOPE = 'reportes:zoho-data';

function periodoToRange(periodo: string): { desde: string; hasta: string } {
  const [year, month] = periodo.split('-').map(Number);
  const desde = new Date(year, month - 1, 1);
  const hasta = new Date(year, month, 0, 23, 59, 59, 999);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
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

// Condición de desarrollo robusta: columna directa (case-insensitive) o fallback JSONB.
// Zoho tiene typo "Desarollo" en deals — se verifican ambas claves.
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
  const [pYear, pMonth] = periodo.split('-').map(Number);

  logger.info('Calculando datos de reporte', { desarrollo, periodo }, SCOPE);

  // ── Leads del período ──────────────────────────────────────────────────────
  const leadsResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM zoho_leads
     WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3`,
    [desarrollo, desde, hasta]
  );
  const totalLeads = parseInt(leadsResult.rows[0]?.count ?? '0', 10);

  // ── Leads mes anterior ────────────────────────────────────────────────────
  const leadsAntResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM zoho_leads
     WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3`,
    [desarrollo, desdeAnterior, hastaAnterior]
  );
  const totalLeadsMesAnterior = parseInt(leadsAntResult.rows[0]?.count ?? '0', 10);

  const variacionLeadsPct = totalLeadsMesAnterior === 0
    ? 0
    : Math.round(((totalLeads - totalLeadsMesAnterior) / totalLeadsMesAnterior) * 100);

  // ── Leads por fuente ──────────────────────────────────────────────────────
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

  // ── Visitas (solicitaron cita en el período) ───────────────────────────────
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

  // ── Cierres: usa fecha_firma de commission_sales (fecha real de firma) ────
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

  // ── Detalle de cierres (commission_sales registradas) ────────────────────
  const detalleResult = await query<{
    deal_name: string | null;
    valor_total: string;
    fecha_firma: string;
    propietario_deal: string | null;
  }>(
    `SELECT deal_name, valor_total::text, fecha_firma::text, propietario_deal
     FROM commission_sales
     WHERE LOWER(TRIM(desarrollo)) = LOWER(TRIM($1))
       AND fecha_firma >= $2::date AND fecha_firma <= $3::date
     ORDER BY fecha_firma
     LIMIT 20`,
    [desarrollo, desde, hasta]
  );
  const cierresDetalle: CierreDetalle[] = detalleResult.rows.map(r => ({
    deal_name: r.deal_name ?? 'Sin nombre',
    monto: parseFloat(r.valor_total ?? '0'),
    fecha_firma: r.fecha_firma ?? '',
    asesor: r.propietario_deal ?? 'Sin asesor',
  }));

  // ── Tasas de conversión ───────────────────────────────────────────────────
  const tasaConversionLeadVisita = totalLeads > 0
    ? Math.round((totalVisitas / totalLeads) * 100) : 0;
  const tasaConversionVisitaCierre = totalVisitas > 0
    ? Math.round((totalCierres / totalVisitas) * 100) : 0;

  // ── Histórico últimos 6 meses ─────────────────────────────────────────────
  const last6 = getLast6Months(periodo);
  const historico6Meses: MesHistorico[] = await Promise.all(
    last6.map(async (mes) => {
      const { desde: d, hasta: h } = periodoToRange(mes);
      const [lRes, vRes, cRes] = await Promise.all([
        query<{ count: string }>(
          `SELECT COUNT(*) as count FROM zoho_leads
           WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3`,
          [desarrollo, d, h]
        ),
        query<{ count: string }>(
          `SELECT COUNT(*) as count FROM zoho_leads
           WHERE ${desarrolloCond(1)} AND created_time >= $2 AND created_time <= $3
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
             AND (zd.stage ILIKE '%cerrad%' OR zd.stage ILIKE '%won%'
                  OR zd.stage ILIKE '%ganad%' OR zd.stage ILIKE '%vendid%')`,
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

  // ── Descartes totales ─────────────────────────────────────────────────────
  const descartesResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM zoho_leads
     WHERE ${desarrolloCond(1)}
       AND created_time >= $2 AND created_time <= $3
       AND (
         (motivo_descarte IS NOT NULL AND motivo_descarte != '')
         OR lead_status ILIKE '%descart%'
       )`,
    [desarrollo, desde, hasta]
  );
  const totalDescartes = parseInt(descartesResult.rows[0]?.count ?? '0', 10);

  // ── Descartes por motivo (top 5) ──────────────────────────────────────────
  const motivosResult = await query<{ motivo: string; cantidad: string }>(
    `SELECT
       COALESCE(
         NULLIF(motivo_descarte, ''),
         data->>'Raz_n_de_descarte',
         data->>'Motivo_Descarte',
         'Sin motivo'
       ) as motivo,
       COUNT(*) as cantidad
     FROM zoho_leads
     WHERE ${desarrolloCond(1)}
       AND created_time >= $2 AND created_time <= $3
       AND (
         (motivo_descarte IS NOT NULL AND motivo_descarte != '')
         OR lead_status ILIKE '%descart%'
       )
     GROUP BY motivo
     ORDER BY cantidad DESC
     LIMIT 5`,
    [desarrollo, desde, hasta]
  );
  const descartesPorMotivo: MotivoDescarte[] = motivosResult.rows.map(r => ({
    motivo: r.motivo,
    cantidad: parseInt(r.cantidad, 10),
  }));

  // ── Descartes semanales (semanas fijas del mes) ───────────────────────────
  const semanaDefs = [
    { semana: 'S1', inicio: 1,  fin: 7  },
    { semana: 'S2', inicio: 8,  fin: 14 },
    { semana: 'S3', inicio: 15, fin: 21 },
    { semana: 'S4', inicio: 22, fin: 31 },
  ];
  const monthEnd = new Date(pYear, pMonth, 0, 23, 59, 59, 999);

  const descartesSemanal: DescartesSemanal[] = await Promise.all(
    semanaDefs.map(async (s) => {
      const dStart = new Date(pYear, pMonth - 1, s.inicio).toISOString();
      let dEnd = new Date(pYear, pMonth - 1, s.fin, 23, 59, 59, 999);
      if (dEnd > monthEnd) dEnd = monthEnd;

      const r = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM zoho_leads
         WHERE ${desarrolloCond(1)}
           AND created_time >= $2 AND created_time <= $3
           AND (
             (motivo_descarte IS NOT NULL AND motivo_descarte != '')
             OR lead_status ILIKE '%descart%'
           )`,
        [desarrollo, dStart, dEnd.toISOString()]
      );
      return { semana: s.semana, cantidad: parseInt(r.rows[0]?.count ?? '0', 10) };
    })
  );

  logger.info('Datos de reporte calculados', {
    desarrollo, periodo, totalLeads, totalVisitas, totalCierres, totalDescartes,
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
    cierresDetalle,
    tasaConversionLeadVisita,
    tasaConversionVisitaCierre,
    historico6Meses,
    totalDescartes,
    descartesPorMotivo,
    descartesSemanal,
  };
}
