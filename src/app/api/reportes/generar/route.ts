import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import { getReporteData } from '@/lib/modules/reportes/zoho-data.service';
import { analizarReporte } from '@/lib/modules/reportes/llm-analyzer.service';
import { autofillTemplate, exportDesign } from '@/lib/modules/reportes/canva.service';
import type { APIResponse } from '@/types/documents';
import type { ReporteRow } from '@/lib/modules/reportes/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const SCOPE = 'reportes:generar';

function getValidDesarrollos(): string[] {
  const env = process.env.VALID_DESARROLLOS;
  if (!env) return [];
  return env.split(',').map(d => d.trim()).filter(Boolean);
}

function getTemplateId(desarrollo: string): string | undefined {
  const key = `CANVA_TEMPLATE_ID_${desarrollo.toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_')}`;
  return process.env[key];
}

// Siempre INSERT nuevo — sin restricción única (ver migration 050)
async function insertReporte(
  desarrollo: string,
  periodo: string,
  status: string,
  metadata: Record<string, unknown>
): Promise<number> {
  const res = await query<{ id: number }>(
    `INSERT INTO reportes (desarrollo, periodo, status, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [desarrollo, periodo, status, JSON.stringify(metadata)]
  );
  return res.rows[0].id;
}

async function updateReporte(
  id: number,
  fields: Partial<{
    status: string;
    canva_design_id: string;
    canva_export_url: string;
    error_message: string | null;
    generated_at: string;
    metadata: Record<string, unknown>;
  }>
): Promise<void> {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map(k => {
    const v = fields[k];
    return k === 'metadata' ? JSON.stringify(v) : v;
  });
  await query(
    `UPDATE reportes SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...values]
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  const debugSteps: { step: string; ts: string; ok: boolean; detail?: string }[] = [];

  function addStep(step: string, ok: boolean, detail?: string) {
    debugSteps.push({ step, ts: new Date().toISOString(), ok, detail });
  }

  let reporteId: number | null = null;

  try {
    // 1. Autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    const payload = verifyAccessToken(token);
    if (!payload) return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });

    // 2. Validar body
    const body = await request.json() as { desarrollo?: string; periodo?: string };
    const { desarrollo, periodo } = body;

    if (!desarrollo || !periodo) {
      return NextResponse.json({ success: false, error: 'Se requieren desarrollo y periodo' }, { status: 400 });
    }
    if (!PERIODO_REGEX.test(periodo)) {
      return NextResponse.json(
        { success: false, error: 'El periodo debe tener formato YYYY-MM (ej: 2026-03)' },
        { status: 400 }
      );
    }

    const validDesarrollos = getValidDesarrollos();
    if (validDesarrollos.length > 0 && !validDesarrollos.includes(desarrollo)) {
      return NextResponse.json(
        { success: false, error: `Desarrollo inválido. Válidos: ${validDesarrollos.join(', ')}` },
        { status: 400 }
      );
    }

    const templateId = getTemplateId(desarrollo);
    if (!templateId) {
      return NextResponse.json(
        { success: false, error: `No hay template Canva configurado para: ${desarrollo}` },
        { status: 400 }
      );
    }

    addStep('validacion', true, `desarrollo=${desarrollo} periodo=${periodo} templateId=${templateId}`);
    logger.info('Iniciando generación de reporte', { desarrollo, periodo }, SCOPE);

    // 3. Crear reporte en BD
    reporteId = await insertReporte(desarrollo, periodo, 'processing', { debug_steps: debugSteps });
    addStep('bd_insert', true, `reporteId=${reporteId}`);
    logger.info('Reporte creado en BD', { reporteId }, SCOPE);

    // 4. Obtener datos de Zoho
    let reporteData;
    try {
      reporteData = await getReporteData(desarrollo, periodo);
      addStep('zoho_data', true, `leads=${reporteData.totalLeads} visitas=${reporteData.totalVisitas} cierres=${reporteData.totalCierres}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addStep('zoho_data', false, msg);
      await updateReporte(reporteId, { status: 'error', error_message: msg, metadata: { debug_steps: debugSteps } });
      throw err;
    }

    // 5. Analizar con LLM
    let slides;
    try {
      slides = await analizarReporte(reporteData, desarrollo, periodo);
      addStep('llm_analisis', true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addStep('llm_analisis', false, msg);
      await updateReporte(reporteId, { status: 'error', error_message: msg, metadata: { debug_steps: debugSteps } });
      throw err;
    }

    // 6. Autofill Canva
    let designId: string;
    try {
      designId = await autofillTemplate(templateId, slides, `Reporte ${desarrollo} ${periodo}`);
      addStep('canva_autofill', true, `designId=${designId}`);
      await updateReporte(reporteId, { canva_design_id: designId, metadata: { debug_steps: debugSteps } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addStep('canva_autofill', false, msg);
      await updateReporte(reporteId, { status: 'error', error_message: msg, metadata: { debug_steps: debugSteps } });
      throw err;
    }

    // 7. Export Canva
    let exportUrl: string;
    try {
      exportUrl = await exportDesign(designId);
      addStep('canva_export', true, exportUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addStep('canva_export', false, msg);
      await updateReporte(reporteId, { status: 'error', error_message: msg, metadata: { debug_steps: debugSteps } });
      throw err;
    }

    // 8. Marcar listo
    await updateReporte(reporteId, {
      status: 'ready',
      canva_export_url: exportUrl,
      generated_at: new Date().toISOString(),
      error_message: null,
      metadata: { debug_steps: debugSteps },
    });

    logger.info('Reporte generado exitosamente', { reporteId, exportUrl }, SCOPE);

    return NextResponse.json({
      success: true,
      data: { reporte_id: reporteId, status: 'ready', url: exportUrl },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error generando reporte';
    logger.error('Error generando reporte', error, {}, SCOPE);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export type { ReporteRow };
