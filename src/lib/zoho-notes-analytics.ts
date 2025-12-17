/**
 * =====================================================
 * ZOHO NOTES - LIGHTWEIGHT ANALYTICS (CLIENT + SERVER SAFE)
 * =====================================================
 * Small deterministic helpers to build the chart data used in the Zoho dashboard:
 * - Top repeated terms (after basic normalization + stopwords)
 * - Trend over time buckets for the top 3 terms
 *
 * Important:
 * - This is NOT "AI". It's deterministic text analytics.
 * - We keep it dependency-free so it works in both browser and Node runtimes.
 */

import { buildBucketKeys, getBucketKeyForDate, getRollingPeriodDates, type TimePeriod } from './time-buckets';

export type NotesPeriod = TimePeriod;

export interface NotesChartTopTerm {
  term: string;
  count: number;
}

export type NotesChartTrendRow = Record<string, number | string> & { bucket: string };

export interface NotesChartResult {
  topTerms: NotesChartTopTerm[];
  trendTerms: string[];
  trend: NotesChartTrendRow[];
}

export interface NotesMetricsTrendRow {
  bucket: string;
  noAnswerOrNoContact: number;
  priceOrBudget: number;
  financingOrCredit: number;
  locationOrArea: number;
  timingOrUrgency: number;
}

export interface NotesMetricsTrendResult {
  metricsTrend: NotesMetricsTrendRow[];
}

// Minimal Spanish stopwords list (extend as needed).
// Keep it aligned with the dashboard stopwords to avoid surprises.
const STOPWORDS = new Set([
  'de','la','que','el','en','y','a','los','del','se','las','por','un','para','con','no','una','su','al','lo',
  'como','mas','pero','sus','le','ya','o','este','si','porque','esta','son','entre','cuando','muy','sin','sobre',
  'tambien','me','hasta','hay','donde','quien','desde','todo','nos','durante','todos','uno','les','ni','contra',
  'otros','ese','eso','ante','ellos','e','esto','mi','mis','tu','tus','te','usted','ustedes','hoy','ayer','manana',
  'cliente','clientes','lead','leads','deal','deals','cita','visita','whatsapp','mensaje','llamada','llamadas',
  'contacto','contactar','info','informacion','datos','telefono','correo','email','nombre','precio','mxn','peso','pesos',
  // English/common templates
  'find','recording','here','call','calls','assets',
]);

function normalizeText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(input: string): string {
  return String(input || '')
    .replace(/find\s+recording\s+here\s*:?\s*https?:\/\/\S+/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/aircall/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input: string): string[] {
  const normalized = normalizeText(stripNoise(input));
  if (!normalized) return [];

  return normalized
    .split(' ')
    .filter((w) => w.length >= 3) // ignore very short tokens
    .filter((w) => !STOPWORDS.has(w))
    .filter((w) => !/^\d+$/.test(w)); // ignore numbers-only tokens
}

function coerceDate(input?: string | Date): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveRange(
  period: NotesPeriod,
  startDate?: string | Date,
  endDate?: string | Date
): { start: Date; end: Date } {
  const s = coerceDate(startDate);
  const e = coerceDate(endDate);
  if (s && e) return { start: s, end: e };
  const fallback = getRollingPeriodDates(period, false, new Date());
  return { start: fallback.startDate, end: fallback.endDate };
}

export function computeNotesCharts(params: {
  notes: Array<{ text: string; createdTime?: string }>;
  period: NotesPeriod;
  startDate?: string | Date;
  endDate?: string | Date;
}): NotesChartResult {
  const { notes, period, startDate, endDate } = params;
  const range = resolveRange(period, startDate, endDate);
  const bucketKeys = buildBucketKeys(period, range.start, range.end);

  const termCounts = new Map<string, number>();

  for (const n of notes) {
    const words = tokenize(n.text);
    for (const w of words) {
      termCounts.set(w, (termCounts.get(w) || 0) + 1);
    }
  }

  const topTerms: NotesChartTopTerm[] = Array.from(termCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));

  const trendTerms = topTerms.slice(0, 3).map((t) => t.term);

  // Pre-create rows for all buckets so charts always have a stable number of points.
  const trendMap = new Map<string, NotesChartTrendRow>();
  for (const b of bucketKeys) {
    const row: NotesChartTrendRow = { bucket: b } as NotesChartTrendRow;
    for (const term of trendTerms) row[term] = 0;
    trendMap.set(b, row);
  }

  for (const n of notes) {
    if (!n.createdTime) continue;
    const created = new Date(n.createdTime);
    if (Number.isNaN(created.getTime())) continue;
    const bucket = getBucketKeyForDate(created, period, range.start);
    const row = trendMap.get(bucket);
    if (!row) continue;
    const words = tokenize(n.text);

    for (const term of trendTerms) {
      const occurrences = words.reduce((acc, w) => acc + (w === term ? 1 : 0), 0);
      if (occurrences > 0) {
        const prev = typeof row[term] === 'number' ? (row[term] as number) : 0;
        row[term] = prev + occurrences;
      }
    }

    trendMap.set(bucket, row);
  }

  const trend = bucketKeys.map((b) => trendMap.get(b) as NotesChartTrendRow);

  return { topTerms, trendTerms, trend };
}

/**
 * Computes a time series for the 5 "executive" metric buckets.
 *
 * We deliberately keep this deterministic (keyword/phrase matching) so it:
 * - Works with free tiers (no extra AI cost)
 * - Is stable across runs
 * - Can be stored and charted consistently
 */
export function computeNotesMetricsTrend(params: {
  notes: Array<{ text: string; createdTime?: string }>;
  period: NotesPeriod;
  startDate?: string | Date;
  endDate?: string | Date;
}): NotesMetricsTrendResult {
  const { notes, period, startDate, endDate } = params;
  const range = resolveRange(period, startDate, endDate);
  const bucketKeys = buildBucketKeys(period, range.start, range.end);

  // Normalize once per note and use phrase matching.
  const normalizeForMatch = (input: string) => normalizeText(stripNoise(input));

  // Keyword groups (keep simple + conservative).
  // We count "mentions" as 1 per note per category if any keyword matches.
  const KEYWORDS = {
    noAnswerOrNoContact: [
      'no contesta',
      'no contestó',
      'no responde',
      'sin respuesta',
      'sin contacto',
      'no localizado',
      'no localiza',
      'buzon',
      'buzón',
      'no fue posible contactar',
      'no se pudo contactar',
      'sin comunicación',
    ],
    priceOrBudget: [
      'precio',
      'presupuesto',
      'costo',
      'coste',
      'caro',
      'barato',
      'cotizacion',
      'cotización',
      'mensualidad',
      'enganche',
      'pago',
      '$',
    ],
    financingOrCredit: [
      'credito',
      'crédito',
      'financiamiento',
      'hipoteca',
      'banco',
      'infonavit',
      'fovissste',
      'preaprob',
      'buró',
      'buro',
      'score',
    ],
    locationOrArea: [
      'ubicacion',
      'ubicación',
      'zona',
      'area',
      'área',
      'cerca',
      'lejos',
      'distancia',
      'rumbo',
      'colonia',
      'mapa',
    ],
    timingOrUrgency: [
      'urgente',
      'pronto',
      'este mes',
      'proximo mes',
      'próximo mes',
      'siguiente mes',
      'fecha',
      'cuando',
      'cuándo',
      'tiempo',
      'en semanas',
      'en meses',
      'este año',
      'año',
      'ano',
      'entrega',
      'mudarse',
    ],
  } as const;

  // Pre-create rows for all buckets so charts always have a stable number of points.
  const trendMap = new Map<string, NotesMetricsTrendRow>();
  for (const b of bucketKeys) {
    trendMap.set(b, {
      bucket: b,
      noAnswerOrNoContact: 0,
      priceOrBudget: 0,
      financingOrCredit: 0,
      locationOrArea: 0,
      timingOrUrgency: 0,
    });
  }

  for (const n of notes) {
    if (!n.createdTime) continue;
    const created = new Date(n.createdTime);
    if (Number.isNaN(created.getTime())) continue;
    const bucket = getBucketKeyForDate(created, period, range.start);
    const row = trendMap.get(bucket);
    if (!row) continue;

    const text = normalizeForMatch(n.text);

    const includesAny = (needles: readonly string[]) =>
      needles.some((k) => {
        // k may contain '$' which is not normalized away; keep it simple:
        if (k === '$') return n.text.includes('$');
        return text.includes(normalizeText(k));
      });

    if (includesAny(KEYWORDS.noAnswerOrNoContact)) row.noAnswerOrNoContact += 1;
    if (includesAny(KEYWORDS.priceOrBudget)) row.priceOrBudget += 1;
    if (includesAny(KEYWORDS.financingOrCredit)) row.financingOrCredit += 1;
    if (includesAny(KEYWORDS.locationOrArea)) row.locationOrArea += 1;
    if (includesAny(KEYWORDS.timingOrUrgency)) row.timingOrUrgency += 1;

    trendMap.set(bucket, row);
  }

  const metricsTrend = bucketKeys.map((b) => trendMap.get(b) as NotesMetricsTrendRow);

  return { metricsTrend };
}


