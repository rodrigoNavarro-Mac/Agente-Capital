import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getReporteData } from '../zoho-data.service';

vi.mock('@/lib/db/postgres', () => ({
  query: vi.fn(),
  saveBridgeLog: vi.fn(),
  saveStateTransition: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { query } from '@/lib/db/postgres';
const mockQuery = vi.mocked(query);

// Helper para crear respuesta fake de query
function fakeResult(rows: unknown[]) {
  return Promise.resolve({ rows } as Awaited<ReturnType<typeof query>>);
}

describe('getReporteData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcula variación % correctamente', async () => {
    let callCount = 0;
    mockQuery.mockImplementation(() => {
      callCount++;
      const responses: Record<number, unknown[]> = {
        1: [{ count: '10' }],         // leads período
        2: [{ count: '8' }],          // leads anterior
        3: [{ fuente: 'Facebook', cantidad: '10' }], // fuentes
        4: [{ count: '4' }],          // visitas
        5: [{ count: '2', monto_total: '1000' }],    // cierres
      };
      const rows = responses[callCount] ?? [{ count: '0', monto_total: '0' }];
      return fakeResult(rows);
    });

    const data = await getReporteData('FUEGO', '2026-03');

    expect(data.totalLeads).toBe(10);
    expect(data.totalLeadsMesAnterior).toBe(8);
    expect(data.variacionLeadsPct).toBe(25); // (10-8)/8 * 100 = 25%
    expect(data.totalVisitas).toBe(4);
    expect(data.totalCierres).toBe(2);
    expect(data.tasaConversionLeadVisita).toBe(40); // 4/10 * 100
    expect(data.tasaConversionVisitaCierre).toBe(50); // 2/4 * 100
  });

  it('maneja 0 leads en mes anterior sin dividir por cero', async () => {
    mockQuery.mockImplementation(() =>
      fakeResult([{ count: '5', fuente: 'Web', cantidad: '5', monto_total: '0' }])
    );

    const data = await getReporteData('AMURA', '2026-03');
    expect(isFinite(data.variacionLeadsPct)).toBe(true);
  });

  it('agrupa leads por fuente correctamente', async () => {
    let callCount = 0;
    mockQuery.mockImplementation(() => {
      callCount++;
      if (callCount === 3) {
        return fakeResult([
          { fuente: 'Facebook', cantidad: '6' },
          { fuente: 'Instagram', cantidad: '4' },
        ]);
      }
      return fakeResult([{ count: '10', monto_total: '0' }]);
    });

    const data = await getReporteData('FUEGO', '2026-02');
    expect(data.leadsPorFuente).toHaveLength(2);
    expect(data.leadsPorFuente[0].fuente).toBe('Facebook');
    expect(data.leadsPorFuente[0].porcentaje).toBe(60);
    expect(data.leadsPorFuente[1].porcentaje).toBe(40);
  });

  it('retorna histórico de 6 meses', async () => {
    mockQuery.mockImplementation(() =>
      fakeResult([{ count: '0', fuente: 'Web', cantidad: '0', monto_total: '0' }])
    );
    const data = await getReporteData('FUEGO', '2026-03');
    expect(data.historico6Meses).toHaveLength(6);
    expect(data.historico6Meses[5].mes).toBe('2026-03');
    expect(data.historico6Meses[0].mes).toBe('2025-10');
  });
});
