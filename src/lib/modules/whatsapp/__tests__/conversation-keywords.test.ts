/**
 * Unit tests for conversation-keywords.
 * No mocks; pure functions only. No WhatsApp API nor DB.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeForMatch,
  matchIntentByKeywords,
  matchAffirmativeByKeywords,
  matchNegativeByKeywords,
  matchCtaPrimarioByKeywords,
  matchCtaCanalByKeywords,
} from '../conversation-keywords';

describe('normalizeForMatch', () => {
  it('lowercases and trims', () => {
    expect(normalizeForMatch('  HOLA  ')).toBe('hola');
  });
  it('collapses multiple spaces', () => {
    expect(normalizeForMatch('hola   mundo')).toBe('hola mundo');
  });
  it('removes accents', () => {
    expect(normalizeForMatch('información')).toBe('informacion');
  });
});

describe('matchIntentByKeywords', () => {
  it('returns comprar for construir/vivir/casa', () => {
    expect(matchIntentByKeywords('quiero construir mi casa')).toBe('comprar');
    expect(matchIntentByKeywords('para vivir')).toBe('comprar');
    expect(matchIntentByKeywords('comprar lote')).toBe('comprar');
  });
  it('returns invertir for inversion/plusvalia/rentar', () => {
    expect(matchIntentByKeywords('quiero invertir')).toBe('invertir');
    expect(matchIntentByKeywords('inversion inmobiliaria')).toBe('invertir');
    expect(matchIntentByKeywords('plusvalia')).toBe('invertir');
  });
  it('returns solo_info for precio/info/cotizacion', () => {
    expect(matchIntentByKeywords('cuanto cuesta')).toBe('solo_info');
    expect(matchIntentByKeywords('solo quiero información')).toBe('solo_info');
    expect(matchIntentByKeywords('cotizacion')).toBe('solo_info');
  });
  it('returns mixto when both invertir and comprar', () => {
    expect(matchIntentByKeywords('invertir y comprar')).toBe('mixto');
  });
  it('returns null for unrelated text', () => {
    expect(matchIntentByKeywords('hola')).toBe(null);
    expect(matchIntentByKeywords('xyz')).toBe(null);
  });
});

describe('matchAffirmativeByKeywords', () => {
  it('returns true for si, ok, claro, vale', () => {
    expect(matchAffirmativeByKeywords('si')).toBe(true);
    expect(matchAffirmativeByKeywords('ok')).toBe(true);
    expect(matchAffirmativeByKeywords('claro')).toBe(true);
    expect(matchAffirmativeByKeywords('vale')).toBe(true);
  });
  it('returns true for visita/llamada/agendar', () => {
    expect(matchAffirmativeByKeywords('visita')).toBe(true);
    expect(matchAffirmativeByKeywords('que me llamen')).toBe(true);
    expect(matchAffirmativeByKeywords('agendar')).toBe(true);
  });
  it('returns false for no or negative', () => {
    expect(matchAffirmativeByKeywords('no')).toBe(false);
    expect(matchAffirmativeByKeywords('no gracias')).toBe(false);
  });
});

describe('matchNegativeByKeywords', () => {
  it('returns true for no, no gracias, luego', () => {
    expect(matchNegativeByKeywords('no')).toBe(true);
    expect(matchNegativeByKeywords('no gracias')).toBe(true);
    expect(matchNegativeByKeywords('luego')).toBe(true);
  });
  it('returns false for affirmative', () => {
    expect(matchNegativeByKeywords('si')).toBe(false);
    expect(matchNegativeByKeywords('visita')).toBe(false);
  });
});

describe('matchCtaPrimarioByKeywords', () => {
  it('returns visitar for visita/ir a ver/conocer', () => {
    expect(matchCtaPrimarioByKeywords('visitar')).toBe('visitar');
    expect(matchCtaPrimarioByKeywords('ir a ver')).toBe('visitar');
    expect(matchCtaPrimarioByKeywords('conocer el desarrollo')).toBe('visitar');
  });
  it('returns contactado for contactar/que me contacten/llamada', () => {
    expect(matchCtaPrimarioByKeywords('contactar un agente')).toBe('contactado');
    expect(matchCtaPrimarioByKeywords('que me contacten')).toBe('contactado');
    expect(matchCtaPrimarioByKeywords('contactar')).toBe('contactado');
  });
  it('returns null when neither clear', () => {
    expect(matchCtaPrimarioByKeywords('hola')).toBe(null);
  });
});

describe('matchCtaCanalByKeywords', () => {
  it('returns llamada for llamada/telefono/que me llamen', () => {
    expect(matchCtaCanalByKeywords('llamada')).toBe('llamada');
    expect(matchCtaCanalByKeywords('por telefono')).toBe('llamada');
    expect(matchCtaCanalByKeywords('que me llamen')).toBe('llamada');
  });
  it('returns videollamada for videollamada/video/zoom', () => {
    expect(matchCtaCanalByKeywords('videollamada')).toBe('videollamada');
    expect(matchCtaCanalByKeywords('por video')).toBe('videollamada');
    expect(matchCtaCanalByKeywords('zoom')).toBe('videollamada');
  });
  it('returns null when neither clear', () => {
    expect(matchCtaCanalByKeywords('tal vez')).toBe(null);
  });
});
