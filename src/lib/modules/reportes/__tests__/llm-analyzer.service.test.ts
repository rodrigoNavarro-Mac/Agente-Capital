import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analizarReporte } from '../llm-analyzer.service';
import type { ReporteData } from '../types';

vi.mock('@/lib/services/llm', () => ({
  runLLM: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { runLLM } from '@/lib/services/llm';
const mockRunLLM = vi.mocked(runLLM);

const mockData: ReporteData = {
  desarrollo: 'FUEGO',
  periodo: '2026-03',
  totalLeads: 50,
  totalLeadsMesAnterior: 40,
  variacionLeadsPct: 25,
  leadsPorFuente: [{ fuente: 'Facebook', cantidad: 30, porcentaje: 60 }],
  totalVisitas: 20,
  totalCierres: 5,
  montoTotalVentas: 5_000_000,
  tasaConversionLeadVisita: 40,
  tasaConversionVisitaCierre: 25,
  historico6Meses: [],
};

const validSlideContent = {
  slide_resumen: { titulo: 'Marzo 2026', insight_principal: 'Buen mes', variacion_leads_texto: '+25%' },
  slide_embudo: { conv_lead_visita: '40%', conv_visita_cierre: '25%', analisis_embudo: 'Embudo eficiente' },
  slide_fuentes: { fuente_principal: 'Facebook', porcentaje_fuente_principal: '60%', comentario: 'Domina Facebook' },
  slide_historico: { tendencia: 'Creciente', mejor_mes: '2026-03', comentario_6m: 'Tendencia positiva' },
  slide_cierres: { unidades: '5', monto_formateado: '$5,000,000 MXN', comentario_cierres: 'Buen cierre' },
};

describe('analizarReporte', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parsea correctamente JSON válido del LLM', async () => {
    mockRunLLM.mockResolvedValue(JSON.stringify(validSlideContent));
    const result = await analizarReporte(mockData, 'FUEGO', '2026-03');
    expect(result.slide_resumen.titulo).toBe('Marzo 2026');
    expect(result.slide_embudo.conv_lead_visita).toBe('40%');
    expect(result.slide_cierres.unidades).toBe('5');
  });

  it('limpia markdown del JSON antes de parsear', async () => {
    mockRunLLM.mockResolvedValue('```json\n' + JSON.stringify(validSlideContent) + '\n```');
    const result = await analizarReporte(mockData, 'FUEGO', '2026-03');
    expect(result.slide_resumen).toBeDefined();
  });

  it('lanza error descriptivo con JSON inválido', async () => {
    mockRunLLM.mockResolvedValue('esto no es json');
    await expect(analizarReporte(mockData, 'FUEGO', '2026-03')).rejects.toThrow(
      /JSON inválido/
    );
  });

  it('lanza error si falta un slide requerido', async () => {
    const incompleto = { ...validSlideContent };
    delete (incompleto as Record<string, unknown>).slide_cierres;
    mockRunLLM.mockResolvedValue(JSON.stringify(incompleto));
    await expect(analizarReporte(mockData, 'FUEGO', '2026-03')).rejects.toThrow(
      /slide_cierres/
    );
  });

  it('tiene todos los campos requeridos en output válido', async () => {
    mockRunLLM.mockResolvedValue(JSON.stringify(validSlideContent));
    const result = await analizarReporte(mockData, 'FUEGO', '2026-03');
    expect(result).toHaveProperty('slide_resumen');
    expect(result).toHaveProperty('slide_embudo');
    expect(result).toHaveProperty('slide_fuentes');
    expect(result).toHaveProperty('slide_historico');
    expect(result).toHaveProperty('slide_cierres');
  });
});
