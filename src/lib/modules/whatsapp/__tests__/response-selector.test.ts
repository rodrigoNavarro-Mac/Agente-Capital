import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectResponseAndState, getResponseText } from '../response-selector';
import type { ConversationState } from '../conversation-state';

vi.mock('@/lib/services/llm', () => ({ runLLM: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { runLLM } from '@/lib/services/llm';
const mockRunLLM = vi.mocked(runLLM);

beforeEach(() => {
  vi.clearAllMocks();
});

const baseInput = {
  development: 'FUEGO',
  currentState: 'FILTRO_INTENCION' as ConversationState,
  userMessage: 'quiero invertir',
  recentMessages: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
  userData: {},
};

// =====================================================
// selectResponseAndState
// =====================================================

describe('selectResponseAndState', () => {
  it('retorna resultado cuando LLM devuelve JSON válido', async () => {
    mockRunLLM.mockResolvedValueOnce(
      JSON.stringify({ responseKey: 'CONFIRMACION_INVERSION', nextState: 'CTA_PRIMARIO', reasoning: 'quiere invertir' })
    );
    const result = await selectResponseAndState(baseInput);
    expect(result).toEqual({
      responseKey: 'CONFIRMACION_INVERSION',
      nextState: 'CTA_PRIMARIO',
      reasoning: 'quiere invertir',
    });
  });

  it('retorna null cuando responseKey no está en la whitelist del estado', async () => {
    mockRunLLM.mockResolvedValueOnce(
      JSON.stringify({ responseKey: 'BIENVENIDA', nextState: 'CTA_PRIMARIO', reasoning: 'test' })
    );
    expect(await selectResponseAndState(baseInput)).toBeNull();
  });

  it('retorna null cuando nextState no está permitido para el estado actual', async () => {
    mockRunLLM.mockResolvedValueOnce(
      JSON.stringify({ responseKey: 'CONFIRMACION_INVERSION', nextState: 'SOLICITUD_NOMBRE', reasoning: 'test' })
    );
    expect(await selectResponseAndState(baseInput)).toBeNull();
  });

  it('retorna null cuando LLM lanza una excepción', async () => {
    mockRunLLM.mockRejectedValueOnce(new Error('LLM unavailable'));
    expect(await selectResponseAndState(baseInput)).toBeNull();
  });

  it('retorna null cuando LLM responde JSON malformado', async () => {
    mockRunLLM.mockResolvedValueOnce('esto no es json {{{');
    expect(await selectResponseAndState(baseInput)).toBeNull();
  });

  it('retorna null cuando JSON no tiene campo responseKey', async () => {
    mockRunLLM.mockResolvedValueOnce(
      JSON.stringify({ nextState: 'CTA_PRIMARIO', reasoning: 'sin clave' })
    );
    expect(await selectResponseAndState(baseInput)).toBeNull();
  });

  it('retorna null cuando JSON no tiene campo nextState', async () => {
    mockRunLLM.mockResolvedValueOnce(
      JSON.stringify({ responseKey: 'CONFIRMACION_INVERSION', reasoning: 'sin estado' })
    );
    expect(await selectResponseAndState(baseInput)).toBeNull();
  });

  it('retorna resultado válido en estado CTA_PRIMARIO hacia SOLICITUD_HORARIO', async () => {
    mockRunLLM.mockResolvedValueOnce(
      JSON.stringify({ responseKey: 'SOLICITUD_HORARIO', nextState: 'SOLICITUD_HORARIO', reasoning: 'visitar' })
    );
    const result = await selectResponseAndState({
      ...baseInput,
      currentState: 'CTA_PRIMARIO',
      userMessage: 'quiero visitar',
    });
    expect(result?.nextState).toBe('SOLICITUD_HORARIO');
    expect(result?.responseKey).toBe('SOLICITUD_HORARIO');
  });

  it('retorna resultado válido en estado SOLICITUD_NOMBRE hacia CLIENT_ACCEPTA', async () => {
    mockRunLLM.mockResolvedValueOnce(
      JSON.stringify({ responseKey: 'HANDOVER_EXITOSO', nextState: 'CLIENT_ACCEPTA', reasoning: 'nombre dado' })
    );
    const result = await selectResponseAndState({
      ...baseInput,
      currentState: 'SOLICITUD_NOMBRE',
      userMessage: 'María López',
    });
    expect(result?.nextState).toBe('CLIENT_ACCEPTA');
    expect(result?.responseKey).toBe('HANDOVER_EXITOSO');
  });
});

// =====================================================
// getResponseText
// =====================================================

describe('getResponseText', () => {
  it('retorna el texto de una clave válida en FUEGO', () => {
    const text = getResponseText('FUEGO', 'BIENVENIDA');
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('reemplaza {NOMBRE} con el nombre formateado cuando se pasa userName', () => {
    const text = getResponseText('FUEGO', 'HANDOVER_EXITOSO', 'maria lopez');
    expect(text).toContain('Maria');
    expect(text).not.toContain('{NOMBRE}');
  });

  it('no falla cuando la clave no existe y retorna string', () => {
    const text = getResponseText('FUEGO', 'FUERA_HORARIO');
    expect(typeof text).toBe('string');
  });
});
