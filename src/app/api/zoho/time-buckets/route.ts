/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM TIME BUCKETS API
 * =====================================================
 * Returns three nested rolling series:
 *   - daily:   last 7 days,  each day -> owners[]
 *   - weekly:  last 8 weeks, each week -> days[] -> owners[]
 *   - monthly: current + previous month, each month -> owners[]
 *
 * Metrics per (day or month, owner):
 *   leads      = zoho_leads.created_time
 *   contacted  = zoho_leads.created_time WHERE lead_status ILIKE '%contactado%'
 *   movements  = zoho_leads.modified_time WHERE lead_status is set
 *                 AND NOT ILIKE '%intento de contacto%'
 *                 AND NOT ILIKE '%descartado%'        (=> Seguimiento)
 *   closed     = zoho_deals (won|lost)    by closing_date
 *               + zoho_leads (descartado) by modified_time
 *   won        = zoho_deals (won)         by closing_date
 *   calls      = zoho_activities (Call)   by call_start_time
 *
 * Same auth + scope rules as /api/zoho/stats and /api/zoho/analytics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getUserDevelopments, query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

const FULL_ACCESS_ROLES = ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'];
const SALES_MANAGER_ROLE = 'sales_manager';
const ALLOWED_ROLES = [...FULL_ACCESS_ROLES, SALES_MANAGER_ROLE];

const TZ = 'America/Merida';

// =====================================================
// TYPES
// =====================================================

export interface Metrics {
  leads: number;
  contacted: number; // Leads en estado "Contactado" (lead_status ILIKE '%contactado%')
  movements: number;
  // De los `movements`, cuantos correspondan a leads CREADOS dentro del
  // mismo bucket que se esta mostrando (mismo dia para grain=day, mismo mes
  // para grain=month). El resto = movements - movementsNew = "Seguimiento
  // a leads de periodos anteriores" (trazabilidad).
  movementsNew: number;
  closed: number;
  won: number;
  calls: number;
}

export interface OwnerRow extends Metrics {
  owner: string;
}

export interface DayBlock {
  date: string;     // 'YYYY-MM-DD'
  label: string;    // 'Lunes 19 May'
  totals: Metrics;
  owners: OwnerRow[];
}

export interface WeekBlock {
  week: string;     // Monday 'YYYY-MM-DD'
  label: string;    // 'Semana 1 (19 May - 25 May)'
  totals: Metrics;
  days: DayBlock[];
}

export interface MonthBlock {
  month: string;    // First day of month 'YYYY-MM-DD'
  label: string;    // 'Mayo 2026'
  totals: Metrics;
  owners: OwnerRow[];
}

export interface TimeBucketsResponse {
  daily: DayBlock[];
  weekly: WeekBlock[];
  monthly: MonthBlock[];
}

// =====================================================
// FILTER HELPERS
// =====================================================

interface Filters {
  desarrollo?: string;
  desarrollos?: string[];
  sources?: string[];
  owners?: string[];
}

function buildBaseFilter(
  filters: Filters,
  startIdx: number,
  options: { includeSource: boolean; includeOwner: boolean }
): { clauses: string[]; params: unknown[]; nextIdx: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let p = startIdx;

  if (filters.desarrollo) {
    clauses.push(`LOWER(TRIM(desarrollo)) = LOWER(TRIM($${p}))`);
    params.push(filters.desarrollo);
    p++;
  } else if (filters.desarrollos && filters.desarrollos.length > 0) {
    clauses.push(`LOWER(TRIM(desarrollo)) = ANY($${p}::text[])`);
    params.push(filters.desarrollos.map((d) => d.trim().toLowerCase()));
    p++;
  }

  if (options.includeSource && filters.sources && filters.sources.length > 0) {
    const expanded = new Set<string>(filters.sources);
    if (expanded.has('Landing Page')) expanded.add('Online Store');
    clauses.push(`lead_source = ANY($${p}::text[])`);
    params.push(Array.from(expanded));
    p++;
  }

  if (options.includeOwner && filters.owners && filters.owners.length > 0) {
    clauses.push(`owner_name = ANY($${p}::text[])`);
    params.push(filters.owners);
    p++;
  }

  return { clauses, params, nextIdx: p };
}

// =====================================================
// QUERY HELPER (DAY or MONTH granularity, grouped by owner)
// =====================================================

interface AggRow {
  bucket: string;  // 'YYYY-MM-DD'
  owner: string;
  count: number;
}

async function aggregate(params: {
  table: string;
  dateCol: string;
  grain: 'day' | 'month';
  startDate: Date;
  filters: Filters;
  options: { includeSource: boolean; includeOwner: boolean };
  extraWhere?: string;
}): Promise<AggRow[]> {
  const { table, dateCol, grain, startDate, filters, options, extraWhere } = params;

  const base = buildBaseFilter(filters, 2, options);

  // For DATE columns (zoho_deals.closing_date) skip the AT TIME ZONE cast,
  // since `date AT TIME ZONE 'X'` is awkward and unnecessary. For TIMESTAMPTZ
  // columns we convert to wall-clock time in Merida before truncating.
  const isDateOnlyColumn = dateCol === 'closing_date';
  const truncExpr = isDateOnlyColumn
    ? `date_trunc('${grain}', ${dateCol}::timestamp)`
    : `date_trunc('${grain}', ${dateCol} AT TIME ZONE '${TZ}')`;

  const whereParts: string[] = [
    `${dateCol} IS NOT NULL`,
    // Explicit cast: pg-node sends Date as ISO string; force it into timestamptz
    // so the column comparison is unambiguous (works for both DATE and TIMESTAMPTZ).
    `${dateCol} >= ($1::timestamptz)`,
    ...base.clauses,
  ];
  if (extraWhere) whereParts.push(extraWhere);

  const sql = `
    SELECT
      to_char(${truncExpr}, 'YYYY-MM-DD') AS bucket,
      COALESCE(NULLIF(TRIM(owner_name), ''), 'Sin asignar') AS owner,
      COUNT(*)::int AS count
    FROM ${table}
    WHERE ${whereParts.join(' AND ')}
    GROUP BY 1, 2
    ORDER BY 1, 2;
  `;

  const queryParams = [startDate.toISOString(), ...base.params];

  try {
    const result = await query<{ bucket: string; owner: string; count: number }>(sql, queryParams);
    return result.rows.map((r) => ({ bucket: r.bucket, owner: r.owner, count: Number(r.count) }));
  } catch (e) {
    // Make failures very visible. Silently returning [] previously made it
    // impossible to tell whether a metric was "really zero" or "the SQL broke".
    console.error('[time-buckets] query FAILED', {
      table, dateCol, grain,
      sql: sql.trim(),
      params: queryParams,
      error: e instanceof Error ? e.message : String(e),
    });
    logger.error(`time-buckets query failed on ${table}.${dateCol} (${grain})`, e, {}, 'zoho-time-buckets');
    return [];
  }
}

/**
 * "Seguimiento": leads cuyo estado NO contiene "intento de contacto"
 * (es decir, ya pasaron de la fase inicial) Y cuya ultima modificacion
 * (modified_time) cae en el bucket. Solo aplica a leads (no a deals),
 * porque "Intento de contacto" es un estado de Lead.
 */
// Seguimiento NO incluye leads aun en "Intento de contacto" (todavia no se
// trabajaron) NI los marcados como "Descartado" (esos cuentan como Cerrados).
const SEGUIMIENTO_WHERE = `lead_status IS NOT NULL AND lead_status NOT ILIKE '%intento de contacto%' AND lead_status NOT ILIKE '%descartado%'`;

async function aggregateSeguimiento(params: {
  grain: 'day' | 'month';
  startDate: Date;
  filters: Filters;
}): Promise<AggRow[]> {
  const { grain, startDate, filters } = params;

  return aggregate({
    table: 'zoho_leads',
    dateCol: 'modified_time',
    grain,
    startDate,
    filters,
    options: { includeSource: true, includeOwner: true },
    extraWhere: SEGUIMIENTO_WHERE,
  });
}

/**
 * "Seguimiento nuevo": de los leads con Seguimiento en el bucket, cuantos
 * fueron CREADOS dentro del mismo bucket (mismo dia o mismo mes segun el
 * grain). Permite separar 'leads de esta semana' vs 'leads anteriores'.
 */
async function aggregateSeguimientoNuevos(params: {
  grain: 'day' | 'month';
  startDate: Date;
  filters: Filters;
}): Promise<AggRow[]> {
  const { grain, startDate, filters } = params;

  return aggregate({
    table: 'zoho_leads',
    dateCol: 'modified_time',
    grain,
    startDate,
    filters,
    options: { includeSource: true, includeOwner: true },
    // Mismo periodo: created_time y modified_time caen en el mismo bucket
    // (cuando trabajamos en zona horaria de Merida).
    extraWhere: `${SEGUIMIENTO_WHERE} AND date_trunc('${grain}', created_time AT TIME ZONE '${TZ}') = date_trunc('${grain}', modified_time AT TIME ZONE '${TZ}')`,
  });
}

// =====================================================
// COLLECT ALL 5 METRICS INTO Map<(bucket, owner) -> Metrics>
// =====================================================

const WON_REGEX = `(ganado|won)`;
const CLOSED_REGEX = `(ganado|won|perdido|lost)`;

type MetricKey = keyof Metrics;

function makeKey(bucket: string, owner: string): string {
  return `${bucket}__${owner}`;
}

async function collectMetrics(
  grain: 'day' | 'month',
  startDate: Date,
  filters: Filters,
  debug: boolean = false
): Promise<Map<string, OwnerRow & { bucket: string }>> {
  const [
    leadsRows,
    contactedRows,
    movementsRows,
    movementsNewRows,
    closedRows,
    leadsDescartadosRows,
    wonRows,
    callsRows,
  ] = await Promise.all([
    aggregate({
      table: 'zoho_leads',
      dateCol: 'created_time',
      grain,
      startDate,
      filters,
      options: { includeSource: true, includeOwner: true },
    }),
    // "Contactado": leads cuyo estado contiene la palabra "contactado". Se
    // agrupan por created_time (mismo bucket que la columna Leads) para que
    // sea facil leer "de los X leads de este dia, Y estan en Contactado".
    aggregate({
      table: 'zoho_leads',
      dateCol: 'created_time',
      grain,
      startDate,
      filters,
      options: { includeSource: true, includeOwner: true },
      extraWhere: `lead_status ILIKE '%contactado%'`,
    }),
    aggregateSeguimiento({ grain, startDate, filters }),
    aggregateSeguimientoNuevos({ grain, startDate, filters }),
    aggregate({
      table: 'zoho_deals',
      dateCol: 'closing_date',
      grain,
      startDate,
      filters,
      options: { includeSource: true, includeOwner: true },
      extraWhere: `stage ~* '${CLOSED_REGEX}'`,
    }),
    // Leads "descartados" tambien cuentan como cerrados: el asesor los
    // saco del pipeline en `modified_time`. NO van a Seguimiento.
    aggregate({
      table: 'zoho_leads',
      dateCol: 'modified_time',
      grain,
      startDate,
      filters,
      options: { includeSource: true, includeOwner: true },
      extraWhere: `lead_status ILIKE '%descartado%'`,
    }),
    aggregate({
      table: 'zoho_deals',
      dateCol: 'closing_date',
      grain,
      startDate,
      filters,
      options: { includeSource: true, includeOwner: true },
      extraWhere: `stage ~* '${WON_REGEX}'`,
    }),
    aggregate({
      table: 'zoho_activities',
      dateCol: 'call_start_time',
      grain,
      startDate,
      filters,
      options: { includeSource: false, includeOwner: true },
      // activity_type may be stored as 'Call', 'Calls' or 'Llamada' depending
      // on the sync path; accept all variants. ILIKE is case-insensitive.
      extraWhere: `(activity_type ILIKE 'call%' OR activity_type ILIKE 'llamada%')`,
    }),
  ]);

  const map = new Map<string, OwnerRow & { bucket: string }>();
  const ensure = (bucket: string, owner: string) => {
    const key = makeKey(bucket, owner);
    let cur = map.get(key);
    if (!cur) {
      cur = { bucket, owner, leads: 0, contacted: 0, movements: 0, movementsNew: 0, closed: 0, won: 0, calls: 0 };
      map.set(key, cur);
    }
    return cur;
  };

  const apply = (metric: MetricKey, rows: AggRow[]) => {
    for (const r of rows) ensure(r.bucket, r.owner)[metric] += r.count;
  };

  apply('leads', leadsRows);
  apply('contacted', contactedRows);
  apply('movements', movementsRows);
  apply('movementsNew', movementsNewRows);
  // closed = deals cerrados (won|lost) + leads marcados como descartado.
  apply('closed', closedRows);
  apply('closed', leadsDescartadosRows);
  apply('won', wonRows);
  apply('calls', callsRows);

  if (debug) {
    // Quick visibility into how many rows each metric returned. Logged to
    // the server console (Next.js terminal in dev).
    console.log('[time-buckets] collectMetrics summary', {
      grain,
      startDate: startDate.toISOString(),
      filters: {
        desarrollo: filters.desarrollo,
        desarrollosCount: filters.desarrollos?.length ?? 0,
        sourcesCount: filters.sources?.length ?? 0,
        ownersCount: filters.owners?.length ?? 0,
      },
      counts: {
        leads: leadsRows.reduce((s, r) => s + r.count, 0),
        contacted: contactedRows.reduce((s, r) => s + r.count, 0),
        movements: movementsRows.reduce((s, r) => s + r.count, 0),
        movementsNew: movementsNewRows.reduce((s, r) => s + r.count, 0),
        closedDeals: closedRows.reduce((s, r) => s + r.count, 0),
        leadsDescartados: leadsDescartadosRows.reduce((s, r) => s + r.count, 0),
        won: wonRows.reduce((s, r) => s + r.count, 0),
        calls: callsRows.reduce((s, r) => s + r.count, 0),
      },
      rawRowsSample: {
        leads: leadsRows.slice(0, 2),
        movements: movementsRows.slice(0, 2),
        closed: closedRows.slice(0, 2),
        calls: callsRows.slice(0, 2),
      },
    });
  }

  return map;
}

// =====================================================
// LABEL HELPERS
// =====================================================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const WEEKDAY_LABELS_ES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const MONTH_LABELS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_SHORT_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function parseBucketDate(bucket: string): Date {
  const [y, m, d] = bucket.split('-').map((v) => parseInt(v, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function dayLabel(bucket: string): string {
  const d = parseBucketDate(bucket);
  return `${WEEKDAY_LABELS_ES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT_ES[d.getUTCMonth()]}`;
}

function weekLabel(monday: Date, weekIndex: number): string {
  const end = new Date(monday);
  end.setUTCDate(end.getUTCDate() + 6);
  return `S${weekIndex} (${monday.getUTCDate()} ${MONTH_SHORT_ES[monday.getUTCMonth()]} - ${end.getUTCDate()} ${MONTH_SHORT_ES[end.getUTCMonth()]})`;
}

function monthLabel(bucket: string): string {
  const d = parseBucketDate(bucket);
  return `${MONTH_LABELS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function bucketKeyForDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// =====================================================
// SCAFFOLD BUILDERS
// =====================================================

function getMondayOfThisWeek(): Date {
  const now = new Date();
  const m = new Date(now);
  m.setUTCHours(0, 0, 0, 0);
  const dow = m.getUTCDay();
  const diffToMonday = (dow + 6) % 7;
  m.setUTCDate(m.getUTCDate() - diffToMonday);
  return m;
}

/**
 * Build the 7 day keys of THIS calendar week (Mon -> Sun), in that order.
 * Future days within the week are included as zero rows (the scaffold
 * guarantees the table always shows all 7 days).
 */
function buildDailyKeys(): string[] {
  const monday = getMondayOfThisWeek();
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(bucketKeyForDate(d));
  }
  return out;
}

/**
 * Build the Mondays of every week that intersects the CURRENT calendar
 * month. A week is anchored to its Monday, so the first week ("S1") is
 * the week containing day 1 of the month (its Monday may fall in the
 * previous month). Returns Mondays oldest -> newest.
 *
 * Example: May 2026 (1st falls on Friday)
 *   S1 -> Mon Apr 27 (week containing May 1)
 *   S2 -> Mon May 4
 *   S3 -> Mon May 11
 *   S4 -> Mon May 18
 *   S5 -> Mon May 25
 */
function buildMonthWeekMondays(): Date[] {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  // First day of current month, then walk back to its Monday.
  const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
  const dow = firstDayOfMonth.getUTCDay();
  const diffToMonday = (dow + 6) % 7;
  const firstWeekMonday = new Date(firstDayOfMonth);
  firstWeekMonday.setUTCDate(firstWeekMonday.getUTCDate() - diffToMonday);

  const out: Date[] = [];
  const cursor = new Date(firstWeekMonday);
  // Add Mondays while the Monday's "week" still belongs to this month
  // (the week belongs to a month if any of its 7 days fall in that month).
  while (true) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    // The new Monday "belongs" to current month if its Monday is in the
    // month, OR if its Sunday (Monday + 6) is in the month.
    const sunday = new Date(cursor);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    if (cursor.getUTCMonth() !== month && sunday.getUTCMonth() !== month) break;
  }
  return out;
}

/** Build the 2 expected month-start keys (oldest to newest). */
function buildMonthlyKeys(): string[] {
  const now = new Date();
  const baseY = now.getUTCFullYear();
  const baseM = now.getUTCMonth();
  const out: string[] = [];
  for (let i = 1; i >= 0; i--) {
    const d = new Date(Date.UTC(baseY, baseM - i, 1));
    out.push(bucketKeyForDate(d));
  }
  return out;
}

// =====================================================
// BUILDERS: ASSEMBLE NESTED BLOCKS
// =====================================================

function emptyMetrics(): Metrics {
  return { leads: 0, contacted: 0, movements: 0, movementsNew: 0, closed: 0, won: 0, calls: 0 };
}

function addMetrics(target: Metrics, src: Metrics): void {
  target.leads += src.leads;
  target.contacted += src.contacted;
  target.movements += src.movements;
  target.movementsNew += src.movementsNew;
  target.closed += src.closed;
  target.won += src.won;
  target.calls += src.calls;
}

function ownersFromMap(map: Map<string, OwnerRow & { bucket: string }>, bucket: string): OwnerRow[] {
  // Collect every owner row that belongs to this bucket. Skip rows with no
  // activity at all (defensive: shouldn't happen because of how we populated
  // the map, but a bucket with truly zero activity will yield an empty list).
  //
  // Note: we wrap with Array.from() because the project's tsconfig target
  // is below ES2015 and does not allow iterating MapIterator with for...of.
  const owners: OwnerRow[] = [];
  for (const row of Array.from(map.values())) {
    if (row.bucket !== bucket) continue;
    const hasActivity = row.leads || row.contacted || row.movements || row.movementsNew || row.closed || row.won || row.calls;
    if (!hasActivity) continue;
    owners.push({
      owner: row.owner,
      leads: row.leads,
      contacted: row.contacted,
      movements: row.movements,
      movementsNew: row.movementsNew,
      closed: row.closed,
      won: row.won,
      calls: row.calls,
    });
  }
  // Sort: 'Sin asignar' last, others alphabetical.
  owners.sort((a, b) => {
    if (a.owner === 'Sin asignar' && b.owner !== 'Sin asignar') return 1;
    if (b.owner === 'Sin asignar' && a.owner !== 'Sin asignar') return -1;
    return a.owner.localeCompare(b.owner, 'es', { sensitivity: 'base' });
  });
  return owners;
}

function buildDayBlock(map: Map<string, OwnerRow & { bucket: string }>, key: string): DayBlock {
  const owners = ownersFromMap(map, key);
  const totals = emptyMetrics();
  for (const o of owners) addMetrics(totals, o);
  return { date: key, label: dayLabel(key), totals, owners };
}

function buildMonthBlock(map: Map<string, OwnerRow & { bucket: string }>, key: string): MonthBlock {
  const owners = ownersFromMap(map, key);
  const totals = emptyMetrics();
  for (const o of owners) addMetrics(totals, o);
  return { month: key, label: monthLabel(key), totals, owners };
}

async function buildDailyAndWeekly(filters: Filters, debug: boolean = false): Promise<{ daily: DayBlock[]; weekly: WeekBlock[] }> {
  // Run a single day-grained query spanning from the earliest Monday of
  // the current calendar month's weeks. That window always covers the
  // current week too (so we can reuse the rows for the daily breakdown).
  const monthMondays = buildMonthWeekMondays();
  const startDate = new Date(monthMondays[0]); // first Monday of S1
  const map = await collectMetrics('day', startDate, filters, debug);

  // ---- DAILY (Mon -> Sun of THIS week, in that order) ----
  const dailyKeys = buildDailyKeys(); // Mon -> Sun (oldest first)
  const daily: DayBlock[] = dailyKeys.map((k) => buildDayBlock(map, k));

  // ---- WEEKLY (S1 -> Sn of THIS month, in that order) ----
  // S1 = first week of the month (the week containing day 1), S2 = next, etc.
  // Each week expands to its 7 days Mon -> Sun.
  const weekly: WeekBlock[] = monthMondays.map((monday, idx) => {
    const sNumber = idx + 1; // 1-based: S1 is the first week of the month
    const days: DayBlock[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const key = bucketKeyForDate(d);
      days.push(buildDayBlock(map, key));
    }
    const totals = emptyMetrics();
    for (const day of days) addMetrics(totals, day.totals);
    return {
      week: bucketKeyForDate(monday),
      label: weekLabel(monday, sNumber),
      totals,
      days,
    };
  });

  return { daily, weekly };
}

async function buildMonthly(filters: Filters, debug: boolean = false): Promise<MonthBlock[]> {
  const keys = buildMonthlyKeys(); // oldest -> newest (2 entries)
  const startDate = parseBucketDate(keys[0]);
  const map = await collectMetrics('month', startDate, filters, debug);

  // newest first
  return keys.map((k) => buildMonthBlock(map, k)).reverse();
}

// =====================================================
// REQUEST HANDLER
// =====================================================

function normalizeDevelopment(value: string): string {
  return value.trim().toLowerCase();
}

function splitCsv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const arr = value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  return arr.length > 0 ? arr : undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<TimeBucketsResponse>>> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });
    }

    if (!ALLOWED_ROLES.includes(payload.role ?? '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a las estadísticas de Zoho CRM.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const desarrolloParam = searchParams.get('desarrollo') || undefined;
    const sourcesParam = splitCsv(searchParams.get('source'));
    const ownersParam = splitCsv(searchParams.get('owner'));
    // Pass `?debug=1` in the URL to emit verbose query summaries on the server console.
    const debug = searchParams.get('debug') === '1';

    const isSalesManager = payload.role === SALES_MANAGER_ROLE;
    let effectiveDesarrollo: string | undefined = desarrolloParam;
    let effectiveDesarrollos: string[] | undefined;

    if (isSalesManager) {
      const devs = await getUserDevelopments(payload.userId);
      const allowed = Array.from(
        new Set(
          devs
            .filter((d) => d.can_query)
            .map((d) => d.development)
            .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
            .map((d) => normalizeDevelopment(d))
        )
      ).sort();

      if (allowed.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No tienes desarrollos asignados para consultar Zoho CRM.' },
          { status: 403 }
        );
      }

      if (typeof desarrolloParam === 'string' && desarrolloParam.trim().length > 0) {
        const normalized = normalizeDevelopment(desarrolloParam);
        if (!allowed.includes(normalized)) {
          return NextResponse.json(
            { success: false, error: 'No tienes permiso para ver ese desarrollo.' },
            { status: 403 }
          );
        }
        effectiveDesarrollo = normalized;
      } else {
        effectiveDesarrollo = undefined;
        effectiveDesarrollos = allowed;
      }
    }

    const filters: Filters = {
      desarrollo: effectiveDesarrollo,
      desarrollos: effectiveDesarrollos,
      sources: sourcesParam,
      owners: ownersParam,
    };

    const [{ daily, weekly }, monthly] = await Promise.all([
      buildDailyAndWeekly(filters, debug),
      buildMonthly(filters, debug),
    ]);

    return NextResponse.json({
      success: true,
      data: { daily, weekly, monthly },
    });
  } catch (error) {
    logger.error('Error en time-buckets de Zoho', error, {}, 'zoho-time-buckets');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error en time-buckets de Zoho CRM',
      },
      { status: 500 }
    );
  }
}
