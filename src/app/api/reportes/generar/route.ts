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

async function upsertReporte(
  desarrollo: string,
  periodo: string,
  fields: Partial<{
    status: string;
    canva_design_id: string | null;
    canva_export_url: string | null;
    error_message: string | null;
    metadata: Record<string, unknown>;
    generated_at: Date | null;
  }>
): Promise<number> {
  const fieldKeys = Object.keys(fields).filter(k => fields[k as keyof typeof fields] !== undefined);
  const fieldValues = fieldKeys.map(k => {
    const v = fields[k as keyof typeof fields];
    return v instanceof Date ? v.toISOString() : v;
  });

  if (fieldKeys.length === 0) {
    const res = await query<{ id: number }>(
      `INSERT INTO reportes (desarrollo, periodo) VALUES ($1, $2)
       ON CONFLICT (desarrollo, periodo) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [desarrollo, periodo]
    );
    return res.rows[0].id;
  }

  const insertCols = ['desarrollo', 'periodo', ...fieldKeys].join(', ');
  const insertPlaceholders = ['$1', '$2', ...fieldKeys.map((_, i) => `$${i + 3}`)].join(', ');
  const updateSet = fieldKeys.map((k, i) => `${k} = $${i + 3}`).join(', ');

  const res = await query<{ id: number }>(
    `INSERT INTO reportes (${insertCols}) VALUES (${insertPlaceholders})
     ON CONFLICT (desarrollo, periodo) DO UPDATE SET
       updated_at = CURRENT_TIMESTAMP,
       ${updateSet}
     RETURNING id`,
    [desarrollo, periodo, ...fieldValues]
  );
  return res.rows[0].id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // 1. Autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });
    }

    // 2. Validar body
    const body = await request.json() as { desarrollo?: string; periodo?: string };
    const { desarrollo, periodo } = body;

    if (!desarrollo || !periodo) {
      return NextResponse.json(
        { success: false, error: 'Se requieren los campos desarrollo y periodo' },
        { status: 400 }
      );
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
        { success: false, error: `No hay template Canva configurado para el desarrollo: ${desarrollo}` },
        { status: 400 }
      );
    }

    logger.info('Iniciando generación de reporte', { desarrollo, periodo }, SCOPE);

    // 3. Crear/actualizar reporte en BD con status processing
    const reporteId = await upsertReporte(desarrollo, periodo, { status: 'processing' });
    logger.info('Reporte creado en BD', { reporteId }, SCOPE);

    // 4. Obtener datos de Zoho
    let reporteData;
    try {
      reporteData = await getReporteData(desarrollo, periodo);
    } catch (err) {
      await upsertReporte(desarrollo, periodo, {
        status: 'error',
        error_message: err instanceof Error ? err.message : 'Error obteniendo datos de Zoho',
      });
      throw err;
    }

    // 5. Analizar con LLM
    let slides;
    try {
      slides = await analizarReporte(reporteData, desarrollo, periodo);
    } catch (err) {
      await upsertReporte(desarrollo, periodo, {
        status: 'error',
        error_message: err instanceof Error ? err.message : 'Error en análisis LLM',
      });
      throw err;
    }

    // 6. Autofill en Canva
    let designId: string;
    try {
      designId = await autofillTemplate(
        templateId,
        slides,
        `Reporte ${desarrollo} ${periodo}`
      );
      await upsertReporte(desarrollo, periodo, { canva_design_id: designId });
    } catch (err) {
      await upsertReporte(desarrollo, periodo, {
        status: 'error',
        error_message: err instanceof Error ? err.message : 'Error en Canva autofill',
      });
      throw err;
    }

    // 7. Exportar diseño
    let exportUrl: string;
    try {
      exportUrl = await exportDesign(designId);
    } catch (err) {
      await upsertReporte(desarrollo, periodo, {
        status: 'error',
        error_message: err instanceof Error ? err.message : 'Error en Canva export',
      });
      throw err;
    }

    // 8. Marcar como listo
    await upsertReporte(desarrollo, periodo, {
      status: 'ready',
      canva_export_url: exportUrl,
      generated_at: new Date(),
      error_message: null,
    });

    logger.info('Reporte generado exitosamente', { reporteId, desarrollo, periodo, exportUrl }, SCOPE);

    return NextResponse.json({
      success: true,
      data: {
        reporte_id: reporteId,
        status: 'ready',
        url: exportUrl,
      },
    });

  } catch (error) {
    logger.error('Error generando reporte', error, {}, SCOPE);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error generando reporte',
      },
      { status: 500 }
    );
  }
}

// Exportar tipo para uso en tests
export type { ReporteRow };
