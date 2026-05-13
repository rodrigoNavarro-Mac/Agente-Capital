import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent, classifyCtaPrimario, classifyCtaCanal } from '../intent-classifier';

vi.mock('@/lib/services/llm', () => ({ runLLM: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { runLLM } from '@/lib/services/llm';
const mockRunLLM = vi.mocked(runLLM);

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================
// classifyIntent
// =====================================================

describe('classifyIntent', () => {
  it('retorna comprar cuando LLM responde "comprar"', async () => {
    mockRunLLM.mockResolvedValueOnce('comprar');
    expect(await classifyIntent('quiero un lote para mi casa')).toBe('comprar');
  });

  it('retorna invertir cuando LLM responde "invertir"', async () => {
    mockRunLLM.mockResolvedValueOnce('invertir');
    expect(await classifyIntent('quiero invertir')).toBe('invertir');
  });

  it('retorna solo_info cuando LLM responde "solo_info"', async () => {
    mockRunLLM.mockResolvedValueOnce('solo_info');
    expect(await classifyIntent('solo quiero información')).toBe('solo_info');
  });

  it('retorna comprar cuando el texto de respuesta contiene "comprar" con contexto', async () => {
    mockRunLLM.mockResolvedValueOnce('La intención es comprar');
    expect(await classifyIntent('busco terreno')).toBe('comprar');
  });

  it('retorna null cuando LLM responde algo irreconocible', async () => {
    mockRunLLM.mockResolvedValueOnce('no lo sé');
    expect(await classifyIntent('blah')).toBeNull();
  });

  it('retorna null cuando LLM lanza un error', async () => {
    mockRunLLM.mockRejectedValueOnce(new Error('LLM timeout'));
    expect(await classifyIntent('invertir')).toBeNull();
  });

  it('retorna null cuando LLM retorna string vacío', async () => {
    mockRunLLM.mockResolvedValueOnce('');
    expect(await classifyIntent('hola')).toBeNull();
  });
});

// =====================================================
// classifyCtaPrimario
// =====================================================

describe('classifyCtaPrimario', () => {
  it('retorna visitar cuando LLM responde "visitar"', async () => {
    mockRunLLM.mockResolvedValueOnce('visitar');
    expect(await classifyCtaPrimario('quiero ir a verlo')).toBe('visitar');
  });

  it('retorna contactado cuando LLM responde "contactado"', async () => {
    mockRunLLM.mockResolvedValueOnce('contactado');
    expect(await classifyCtaPrimario('que me llamen')).toBe('contactado');
  });

  it('retorna null cuando LLM responde algo no reconocido', async () => {
    mockRunLLM.mockResolvedValueOnce('cotizacion');
    expect(await classifyCtaPrimario('dame precios')).toBeNull();
  });

  it('retorna null cuando LLM lanza un error', async () => {
    mockRunLLM.mockRejectedValueOnce(new Error('timeout'));
    expect(await classifyCtaPrimario('visitar')).toBeNull();
  });
});

// =====================================================
// classifyCtaCanal
// =====================================================

describe('classifyCtaCanal', () => {
  it('retorna videollamada cuando LLM responde "videollamada"', async () => {
    mockRunLLM.mockResolvedValueOnce('videollamada');
    expect(await classifyCtaCanal('prefiero videollamada')).toBe('videollamada');
  });

  it('retorna videollamada cuando LLM incluye "zoom"', async () => {
    mockRunLLM.mockResolvedValueOnce('por zoom');
    expect(await classifyCtaCanal('zoom')).toBe('videollamada');
  });

  it('retorna llamada cuando LLM responde "llamada"', async () => {
    mockRunLLM.mockResolvedValueOnce('llamada');
    expect(await classifyCtaCanal('llamada telefónica')).toBe('llamada');
  });

  it('retorna null cuando LLM responde algo no reconocido', async () => {
    mockRunLLM.mockResolvedValueOnce('whatsapp');
    expect(await classifyCtaCanal('por whatsapp')).toBeNull();
  });

  it('retorna null cuando LLM lanza un error', async () => {
    mockRunLLM.mockRejectedValueOnce(new Error('network error'));
    expect(await classifyCtaCanal('llamada')).toBeNull();
  });
});
