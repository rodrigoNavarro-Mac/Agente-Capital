import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlideContent } from '../types';

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockSlides: SlideContent = {
  slide_resumen: { titulo: 'Test', insight_principal: 'Insight', variacion_leads_texto: '+10%' },
  slide_embudo: { conv_lead_visita: '30%', conv_visita_cierre: '20%', analisis_embudo: 'OK' },
  slide_fuentes: { fuente_principal: 'FB', porcentaje_fuente_principal: '50%', comentario: 'OK' },
  slide_historico: { tendencia: 'Up', mejor_mes: '2026-03', comentario_6m: 'Good' },
  slide_descartes: { total_descartes: '10', top_motivos: ['Sin interés', 'Precio'], insight: 'OK' },
  slide_cierres: { unidades: '3', monto_formateado: '$3M', comentario_cierres: 'OK' },
};

describe('Canva service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.CANVA_CLIENT_ID = 'test-client-id';
    process.env.CANVA_CLIENT_SECRET = 'test-client-secret';
  });

  it('obtiene token OAuth2 y hace autofill', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok123', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ design: { id: 'design-abc' } }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { autofillTemplate } = await import('../canva.service');
    const designId = await autofillTemplate('tmpl_123', mockSlides, 'Test Reporte');
    expect(designId).toBe('design-abc');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/oauth/token');
    expect(fetchMock.mock.calls[1][0]).toContain('/autofills');
  });

  it('hace polling hasta success en exportDesign', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok123', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job: { id: 'job-1' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job: { status: 'in_progress' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job: { status: 'success', urls: ['https://canva.com/export/file.pdf'] } }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { exportDesign } = await import('../canva.service');
    const promise = exportDesign('design-abc');

    // Avanzar timers para los intervalos de polling
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const url = await promise;
    expect(url).toBe('https://canva.com/export/file.pdf');
  });

  it('lanza error si OAuth falla', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    vi.stubGlobal('fetch', fetchMock);

    const { autofillTemplate } = await import('../canva.service');
    await expect(autofillTemplate('tmpl_123', mockSlides)).rejects.toThrow(/Canva OAuth falló/);
  });

  it('incluye body de respuesta Canva en errores HTTP', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => '{"message":"Invalid template"}',
      });
    vi.stubGlobal('fetch', fetchMock);

    const { autofillTemplate } = await import('../canva.service');
    await expect(autofillTemplate('bad-tmpl', mockSlides)).rejects.toThrow(/Invalid template/);
  });
});
