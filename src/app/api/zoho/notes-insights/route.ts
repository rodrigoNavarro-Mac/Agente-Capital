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
import type { APIResponse, LMStudioMessage } from '@/types/documents';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'];

function checkZohoAccessFromToken(role?: string): boolean {
  if (!role) return false;
  return ALLOWED_ROLES.includes(role);
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
    period?: 'month' | 'quarter' | 'year';
    startDate?: string;
    endDate?: string;
    desarrollo?: string;
    source?: string;
    owner?: string;
    status?: string;
  };
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
            'No tienes permisos para acceder a ZOHO CRM. Solo CEO, ADMIN, POST-VENTA, LEGAL y MARKETING pueden acceder.',
        },
        { status: 403 }
      );
    }

    // 2) Body
    const body = (await request.json()) as NotesInsightsRequest;
    const notes = Array.isArray(body?.notes) ? body.notes : [];

    if (notes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se recibieron notas para analizar' },
        { status: 400 }
      );
    }

    // 3) Guardrails (keep request small)
    // - limit notes
    // - limit text length
    const MAX_NOTES = 250;
    const MAX_CHARS_PER_NOTE = 600;
    const compactNotes = notes.slice(0, MAX_NOTES).map((n) => ({
      ...n,
      text: String(n.text || '').slice(0, MAX_CHARS_PER_NOTE),
    }));

    // 4) Prompt (JSON only)
    const system = [
      'Eres un analista ejecutivo de ventas inmobiliarias.',
      'Tu tarea: convertir notas de seguimiento (Leads/Deals) en insights MEDIBLES y accionables.',
      'Regresa SIEMPRE y SOLO un JSON válido (sin markdown, sin texto extra).',
      'No inventes datos: solo usa lo que está en las notas.',
    ].join('\n');

    const user = [
      'Analiza las siguientes notas (ya vienen limpias: sin URLs ni plantillas de grabación).',
      'Devuelve un JSON con esta estructura exacta:',
      '{',
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
      '',
      'Contexto (opcional):',
      JSON.stringify(body.context || {}, null, 2),
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

    return NextResponse.json({ success: true, data: parsed });
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


