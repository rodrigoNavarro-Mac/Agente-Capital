import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/auth', () => ({
  extractTokenFromHeader: vi.fn((h: string | null) => h?.replace('Bearer ', '') ?? null),
  verifyAccessToken: vi.fn(() => ({ userId: 1, role: 'admin' })),
}));

vi.mock('@/lib/db/postgres', () => ({
  query: vi.fn(),
  saveBridgeLog: vi.fn(),
  saveStateTransition: vi.fn(),
}));

vi.mock('@/lib/modules/reportes/zoho-data.service', () => ({
  getReporteData: vi.fn(),
}));

vi.mock('@/lib/modules/reportes/llm-analyzer.service', () => ({
  analizarReporte: vi.fn(),
}));

vi.mock('@/lib/modules/reportes/canva.service', () => ({
  autofillTemplate: vi.fn(),
  exportDesign: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST } from '@/app/api/reportes/generar/route';
import { query } from '@/lib/db/postgres';
import { getReporteData } from '@/lib/modules/reportes/zoho-data.service';
import { analizarReporte } from '@/lib/modules/reportes/llm-analyzer.service';
import { autofillTemplate, exportDesign } from '@/lib/modules/reportes/canva.service';

const mockQuery = vi.mocked(query);
const mockGetReporteData = vi.mocked(getReporteData);
const mockAnalizarReporte = vi.mocked(analizarReporte);
const mockAutofillTemplate = vi.mocked(autofillTemplate);
const mockExportDesign = vi.mocked(exportDesign);

function fakeQueryResult(rows: unknown[]) {
  return Promise.resolve({ rows } as Awaited<ReturnType<typeof query>>);
}

function makeRequest(body: object, authHeader = 'Bearer valid-token') {
  return new NextRequest('http://localhost/api/reportes/generar', {
    method: 'POST',
    headers: {
      authorization: authHeader,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const mockSlides = {
  slide_resumen: { titulo: 'T', insight_principal: 'I', variacion_leads_texto: '+10%' },
  slide_embudo: { conv_lead_visita: '30%', conv_visita_cierre: '20%', analisis_embudo: 'OK' },
  slide_fuentes: { fuente_principal: 'FB', porcentaje_fuente_principal: '50%', comentario: 'C' },
  slide_historico: { tendencia: 'Up', mejor_mes: '2026-03', comentario_6m: 'G' },
  slide_cierres: { unidades: '3', monto_formateado: '$3M', comentario_cierres: 'OK' },
};

describe('POST /api/reportes/generar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VALID_DESARROLLOS = 'FUEGO,AMURA,PUNTO_TIERRA';
    process.env.CANVA_TEMPLATE_ID_FUEGO = 'tmpl_fuego_123';
    delete process.env.CANVA_TEMPLATE_ID_PUNTO_TIERRA;
  });

  it('retorna 400 con periodo inválido', async () => {
    const res = await POST(makeRequest({ desarrollo: 'FUEGO', periodo: '2026-13' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/formato YYYY-MM/);
  });

  it('retorna 400 con desarrollo inválido', async () => {
    const res = await POST(makeRequest({ desarrollo: 'INVALIDO', periodo: '2026-03' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Desarrollo inválido/);
  });

  it('retorna 400 si falta template Canva', async () => {
    const res = await POST(makeRequest({ desarrollo: 'PUNTO_TIERRA', periodo: '2026-03' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/template Canva/);
  });

  it('orquesta todos los pasos y retorna reporte_id, status y url', async () => {
    mockQuery.mockImplementation(() => fakeQueryResult([{ id: 42 }]));
    mockGetReporteData.mockResolvedValue({} as Awaited<ReturnType<typeof getReporteData>>);
    mockAnalizarReporte.mockResolvedValue(mockSlides as Awaited<ReturnType<typeof analizarReporte>>);
    mockAutofillTemplate.mockResolvedValue('design-xyz');
    mockExportDesign.mockResolvedValue('https://canva.com/export/file.pdf');

    const res = await POST(makeRequest({ desarrollo: 'FUEGO', periodo: '2026-03' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ready');
    expect(body.data.url).toBe('https://canva.com/export/file.pdf');
    expect(body.data.reporte_id).toBe(42);
  });

  it('marca el reporte como error si falla getReporteData', async () => {
    mockQuery.mockImplementation(() => fakeQueryResult([{ id: 1 }]));
    mockGetReporteData.mockRejectedValue(new Error('DB error'));

    const res = await POST(makeRequest({ desarrollo: 'FUEGO', periodo: '2026-03' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    const queryCalls = mockQuery.mock.calls;
    const errorUpdate = queryCalls.some(call =>
      typeof call[0] === 'string' && call[0].includes('error')
    );
    expect(errorUpdate).toBe(true);
  });

  it('retorna 401 sin token', async () => {
    const res = await POST(makeRequest({ desarrollo: 'FUEGO', periodo: '2026-03' }, ''));
    expect(res.status).toBe(401);
  });
});
