/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO NOTES AI INSIGHTS API
 * =====================================================
 * Genera insights ejecutivos a partir de notas (Leads/Deals) usando LLM.
 * Solo accesible para CEO, ADMIN, POST-VENTA, MARKETING Y LEGAL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { runLLM } from '@/lib/llm';
import { computeNotesCharts, computeNotesMetricsTrend } from '@/lib/zoho-notes-analytics';
import { createHash } from 'crypto';
import { getUserDevelopments, getZohoNotesAIInsightsByContextHash, upsertZohoNotesAIInsights } from '@/lib/postgres';
import type { APIResponse, LMStudioMessage } from '@/types/documents';

export const dynamic = 'force-dynamic';

const FULL_ACCESS_ROLES = ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'];
const SALES_MANAGER_ROLE = 'sales_manager';
const ALLOWED_ROLES = [...FULL_ACCESS_ROLES, SALES_MANAGER_ROLE];

function checkZohoAccessFromToken(role?: string): boolean {
  if (!role) return false;
  return ALLOWED_ROLES.includes(role);
}

function normalizeDevelopment(value: string): string {
  return value.trim().toLowerCase();
}

// -----------------------------
// Types
// -----------------------------
type NoteSource = 'lead' | 'deal';

interface NoteForAI {
  source: NoteSource;
  createdTime?: string;
  desarrollo?: string;
  owner?: string;
  statusOrStage?: string;
  text: string; // already cleaned on client (no URLs, no call recording templates)
}

interface NotesInsightsRequest {
  notes: NoteForAI[];
  context?: {
    period?: 'week' | 'month' | 'quarter' | 'year';
    startDate?: string;
    endDate?: string;
    desarrollo?: string;
    // Optional: used internally to cache "all assigned developments" for scoped roles.
    // We store it as a string to keep backward compatibility with the existing schema.
    desarrollos?: string[] | string;
    source?: string;
    owner?: string;
    status?: string;
  };
  regenerate?: boolean; // if true, forces a new generation and overwrites stored payload
}

function normalizeContext(input?: NotesInsightsRequest['context']): Record<string, string | null> {
  const ctx = input || {};
  const desarrollosValue =
    Array.isArray((ctx as any).desarrollos)
      ? ((ctx as any).desarrollos as string[]).map((v) => String(v)).join('|')
      : typeof (ctx as any).desarrollos === 'string'
        ? String((ctx as any).desarrollos)
        : null;
  return {
    period: (ctx.period || null) as string | null,
    startDate: typeof ctx.startDate === 'string' ? ctx.startDate : null,
    endDate: typeof ctx.endDate === 'string' ? ctx.endDate : null,
    desarrollo: typeof ctx.desarrollo === 'string' ? ctx.desarrollo : null,
    desarrollos: desarrollosValue,
    source: typeof ctx.source === 'string' ? ctx.source : null,
    owner: typeof ctx.owner === 'string' ? ctx.owner : null,
    status: typeof ctx.status === 'string' ? ctx.status : null,
  };
}

function computeContextHash(normalizedContext: Record<string, string | null>): string {
  // md5 is fine here: it is an identifier, not a security primitive.
  return createHash('md5').update(JSON.stringify(normalizedContext)).digest('hex');
}

/**
 * Intenta extraer JSON aunque el modelo devuelva texto extra.
 */
function safeParseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const slice = trimmed.slice(first, last + 1);
      return JSON.parse(slice) as T;
    }
    throw new Error('Respuesta del modelo no es JSON válido');
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // 1) Auth
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });
    }

    const hasAccess = checkZohoAccessFromToken(payload.role);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No tienes permisos para acceder a ZOHO CRM. Solo CEO, ADMIN, GERENTE DE VENTAS, POST-VENTA, LEGAL y MARKETING pueden acceder.',
        },
        { status: 403 }
      );
    }

    // 2) Context from query params (same fields we store)
    const { searchParams } = new URL(request.url);
    const requestedDevelopment = searchParams.get('desarrollo') || undefined;

    // Sales manager scope: enforce assigned developments.
    const isSalesManager = payload.role === SALES_MANAGER_ROLE;
    let allowedDevs: string[] = [];
    let effectiveDesarrollo: string | undefined = requestedDevelopment;
    let effectiveDesarrollos: string[] | undefined = undefined;

    if (isSalesManager) {
      const devs = await getUserDevelopments(payload.userId);
      allowedDevs = Array.from(
        new Set(
          devs
            .filter((d) => d.can_query)
            .map((d) => d.development)
            .filter((d) => typeof d === 'string' && d.trim().length > 0)
            .map((d) => normalizeDevelopment(d))
        )
      ).sort();

      if (allowedDevs.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No tienes desarrollos asignados para consultar Zoho CRM. Pide a un administrador que te asigne al menos un desarrollo.',
          },
          { status: 403 }
        );
      }

      if (requestedDevelopment) {
        const normalizedRequested = normalizeDevelopment(requestedDevelopment);
        if (!allowedDevs.includes(normalizedRequested)) {
          return NextResponse.json(
            { success: false, error: 'No tienes permiso para ver ese desarrollo en Zoho CRM.' },
            { status: 403 }
          );
        }
        effectiveDesarrollo = normalizedRequested;
      } else {
        // No explicit development: scope to "all assigned developments".
        effectiveDesarrollo = undefined;
        effectiveDesarrollos = allowedDevs;
      }
    }

    const normalizedContext = normalizeContext({
      period: (searchParams.get('period') as any) || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      desarrollo: effectiveDesarrollo,
      // Important: include scoped development list in the context hash to prevent mixing caches across different scopes.
      desarrollos: effectiveDesarrollos ? effectiveDesarrollos.join('|') : undefined,
      source: searchParams.get('source') || undefined,
      owner: searchParams.get('owner') || undefined,
      status: searchParams.get('status') || undefined,
    });

    const contextHash = computeContextHash(normalizedContext);
    const stored = await getZohoNotesAIInsightsByContextHash(contextHash);

    return NextResponse.json({ success: true, data: stored });
  } catch (error) {
    console.error('❌ Error leyendo notes insights guardados:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error leyendo insights guardados',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // 1) Auth
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });
    }

    const hasAccess = checkZohoAccessFromToken(payload.role);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No tienes permisos para acceder a ZOHO CRM. Solo CEO, ADMIN, GERENTE DE VENTAS, POST-VENTA, LEGAL y MARKETING pueden acceder.',
        },
        { status: 403 }
      );
    }

    // 2) Body
    const body = (await request.json()) as NotesInsightsRequest;
    const notes = Array.isArray(body?.notes) ? body.notes : [];

    // 2.1) Sales manager scope: enforce assigned developments (can_query=true)
    const isSalesManager = payload.role === SALES_MANAGER_ROLE;
    let allowedDevs: string[] = [];
    let normalizedRequested: string | null = null;

    if (isSalesManager) {
      const devs = await getUserDevelopments(payload.userId);
      allowedDevs = Array.from(
        new Set(
          devs
            .filter((d) => d.can_query)
            .map((d) => d.development)
            .filter((d) => typeof d === 'string' && d.trim().length > 0)
            .map((d) => normalizeDevelopment(d))
        )
      ).sort();

      if (allowedDevs.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No tienes desarrollos asignados para consultar Zoho CRM. Pide a un administrador que te asigne al menos un desarrollo.',
          },
          { status: 403 }
        );
      }

      const requested = body?.context?.desarrollo;
      if (typeof requested === 'string' && requested.trim().length > 0) {
        normalizedRequested = normalizeDevelopment(requested);
        if (!allowedDevs.includes(normalizedRequested)) {
          return NextResponse.json(
            { success: false, error: 'No tienes permiso para ver ese desarrollo en Zoho CRM.' },
            { status: 403 }
          );
        }
      }
    }

    const normalizedContext = normalizeContext({
      ...(body.context || {}),
      // If sales_manager didn't request a single development, scope the cache to all allowed developments.
      desarrollos:
        isSalesManager && !normalizedRequested
          ? allowedDevs.join('|')
          : (body.context as any)?.desarrollos,
      // If a single development is requested, store the normalized value for stable hashing.
      desarrollo: normalizedRequested ? normalizedRequested : body?.context?.desarrollo,
    });
    const contextHash = computeContextHash(normalizedContext);
    const regenerate = body.regenerate === true;

    // 2.2) Apply server-side note filtering for sales_manager (defense-in-depth).
    const scopedNotes = (() => {
      if (!isSalesManager) return notes;
      const allowedSet = new Set(allowedDevs);
      if (normalizedRequested) {
        return notes.filter((n) => {
          if (!n?.desarrollo) return false;
          return normalizeDevelopment(String(n.desarrollo)) === normalizedRequested;
        });
      }
      return notes.filter((n) => {
        if (!n?.desarrollo) return false;
        return allowedSet.has(normalizeDevelopment(String(n.desarrollo)));
      });
    })();

    if (scopedNotes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se recibieron notas para analizar' },
        { status: 400 }
      );
    }

    // 2.5) If we already have a stored payload for this context and regeneration is not requested, return it.
    if (!regenerate) {
      const stored = await getZohoNotesAIInsightsByContextHash(contextHash);
      if (stored) {
        return NextResponse.json({ success: true, data: stored });
      }
    }

    // 3) Guardrails (keep request small)
    // - limit notes
    // - limit text length
    const MAX_NOTES = 250;
    const MAX_CHARS_PER_NOTE = 600;
    const compactNotes = scopedNotes.slice(0, MAX_NOTES).map((n) => ({
      ...n,
      text: String(n.text || '').slice(0, MAX_CHARS_PER_NOTE),
    }));

    // 3.5) Deterministic chart data (so charts always match the same "dataset" the IA sees)
    const period = (normalizedContext.period as any) || 'month';
    const charts = computeNotesCharts({
      notes: compactNotes.map((n) => ({ text: n.text, createdTime: n.createdTime })),
      period,
      startDate: normalizedContext.startDate || undefined,
      endDate: normalizedContext.endDate || undefined,
    });
    const metricsTrend = computeNotesMetricsTrend({
      notes: compactNotes.map((n) => ({ text: n.text, createdTime: n.createdTime })),
      period,
      startDate: normalizedContext.startDate || undefined,
      endDate: normalizedContext.endDate || undefined,
    });

    // 4) Prompt (JSON only)
    const system = [
      'Eres un analista ejecutivo de ventas inmobiliarias.',
      'Tu tarea: convertir notas de seguimiento (Leads/Deals) en insights MEDIBLES y accionables.',
      'Regresa SIEMPRE y SOLO un JSON válido (sin markdown, sin texto extra).',
      'No inventes datos: solo usa lo que está en las notas.',
    ].join('\n');

    const user = [
      'Analiza las siguientes notas (ya vienen limpias: sin URLs ni plantillas de grabación).',
      'También se incluyen estadísticas determinísticas para gráficas (top palabras y tendencia temporal).',
      'Devuelve un JSON con esta estructura exacta:',
      '{',
      '  "contextHash": string,',
      '  "generatedAt": string,',
      '  "notesCount": number,',
      '  "topTerms": Array<{ "term": string, "count": number }>,',
      '  "trendTerms": string[],',
      '  "trend": Array<{ "bucket": string, "...dynamicTermKeys": number }>,',
      '  "summary": string,',
      '  "topThemes": Array<{ "label": string, "count": number, "examples": string[] }>,',
      '  "topObjections": Array<{ "label": string, "count": number, "examples": string[] }>,',
      '  "nextActions": Array<{ "label": string, "count": number, "examples": string[] }>,',
      '  "frictionSignals": Array<{ "label": string, "count": number, "examples": string[] }>,',
      '  "sentiment": { "positive": number, "neutral": number, "negative": number },',
      '  "metrics": {',
      '     "noAnswerOrNoContact": number,',
      '     "priceOrBudget": number,',
      '     "financingOrCredit": number,',
      '     "locationOrArea": number,',
      '     "timingOrUrgency": number',
      '  }',
      '}',
      '',
      'Reglas:',
      '- counts deben ser enteros.',
      '- examples: máximo 2 ejemplos por item, frases cortas (<= 120 chars).',
      '- En "frictionSignals" prioriza cosas que expliquen pérdida de oportunidad (no contesta, no califica, no presupuesto, etc.).',
      '- Responde en español en los valores (labels/summary/examples).',
      '- "topTerms", "trendTerms" y "trend" deben reflejar EXACTAMENTE las estadísticas proporcionadas (no las recalcules).',
      '',
      'Contexto (opcional):',
      JSON.stringify(normalizedContext, null, 2),
      '',
      'Estadísticas para gráficas (NO recalcular):',
      JSON.stringify(charts, null, 2),
      '',
      'Notas:',
      JSON.stringify(compactNotes, null, 2),
    ].join('\n');

    const messages: LMStudioMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const raw = await runLLM(messages, { temperature: 0.2, max_tokens: 1600 });
    const parsed = safeParseJson<any>(raw);

    // 5) Enforce deterministic chart fields + metadata (so frontend always matches stored payload)
    const enriched = {
      ...parsed,
      contextHash,
      generatedAt: new Date().toISOString(),
      notesCount: compactNotes.length,
      topTerms: charts.topTerms,
      trendTerms: charts.trendTerms,
      trend: charts.trend,
      metricsTrend: metricsTrend.metricsTrend,
    };

    // 6) Persist (best effort)
    await upsertZohoNotesAIInsights({
      contextHash,
      context: normalizedContext,
      notesCount: compactNotes.length,
      payload: enriched,
      generatedByUserId: payload.userId,
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('❌ Error generando notes insights:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error generando insights con IA',
      },
      { status: 500 }
    );
  }
}


