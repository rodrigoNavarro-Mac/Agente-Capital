import { describe, it, expect } from 'vitest';
import { normalizePhoneToInternational, validateMexicanPhone } from '../whatsapp-client';

describe('normalizePhoneToInternational', () => {
    it('10 dígitos → agrega 52', () => {
        expect(normalizePhoneToInternational('2228442014')).toBe('522228442014');
    });

    it('13 dígitos con 521 → quita el 1', () => {
        expect(normalizePhoneToInternational('5212228442014')).toBe('522228442014');
    });

    it('+521XXXXXXXXXX → 52XXXXXXXXXX (quita + y el 1)', () => {
        expect(normalizePhoneToInternational('+5212228442014')).toBe('522228442014');
    });

    it('12 dígitos con 52 → devuelve tal cual', () => {
        expect(normalizePhoneToInternational('522228442014')).toBe('522228442014');
    });

    it('+52XXXXXXXXXX → 52XXXXXXXXXX (quita +)', () => {
        expect(normalizePhoneToInternational('+522228442014')).toBe('522228442014');
    });

    it('número con espacios y guiones → normaliza', () => {
        expect(normalizePhoneToInternational('+52 (222) 844-2014')).toBe('522228442014');
    });
});

describe('validateMexicanPhone', () => {
    it('+5212228442014 → VALIDO (formato histórico WA)', () => {
        const r = validateMexicanPhone('+5212228442014');
        expect(r.result).toBe('VALIDO');
        expect(r.normalizedNumber).toBe('+522228442014');
    });

    it('522228442014 → VALIDO', () => {
        const r = validateMexicanPhone('522228442014');
        expect(r.result).toBe('VALIDO');
    });

    it('2228442014 (10 dígitos) → VALIDO', () => {
        const r = validateMexicanPhone('2228442014');
        expect(r.result).toBe('VALIDO');
        expect(r.normalizedNumber).toBe('+522228442014');
    });

    it('+52 (222) 844-2014 → VALIDO', () => {
        const r = validateMexicanPhone('+52 (222) 844-2014');
        expect(r.result).toBe('VALIDO');
    });

    it('número demasiado corto → INVALIDO', () => {
        const r = validateMexicanPhone('12345');
        expect(r.result).toBe('INVALIDO');
        expect(r.reason).toBe('invalid_format');
    });

    it('número demasiado largo → INVALIDO', () => {
        const r = validateMexicanPhone('5222284420145');
        expect(r.result).toBe('INVALIDO');
    });

    it('1234567890 (secuencia obvia) → INVALIDO', () => {
        const r = validateMexicanPhone('521234567890');
        expect(r.result).toBe('INVALIDO');
        expect(r.reason).toBe('known_test_number');
    });

    it('0000000000 (ceros) → INVALIDO', () => {
        const r = validateMexicanPhone('520000000000');
        expect(r.result).toBe('INVALIDO');
    });

    it('1111111111 (dígito repetido >70%) → SOSPECHOSO', () => {
        const r = validateMexicanPhone('521111111111');
        expect(r.result).toBe('SOSPECHOSO');
        expect(r.reason).toBe('repeated_digits');
    });

    it('9999999999 (dígito repetido >70%) → SOSPECHOSO', () => {
        const r = validateMexicanPhone('529999999999');
        expect(r.result).toBe('SOSPECHOSO');
    });

    it('número con 8+ dígitos secuenciales descendentes → SOSPECHOSO', () => {
        // localPart = 1987654321 → 9→8→7→6→5→4→3→2 son 8 dígitos descendentes
        const r = validateMexicanPhone('521987654321');
        expect(r.result).toBe('SOSPECHOSO');
        expect(r.reason).toBe('sequential_pattern');
    });

    it('número real típico no queda atrapado por secuencia corta', () => {
        // 2228442014 — no tiene 8+ dígitos consecutivos
        const r = validateMexicanPhone('2228442014');
        expect(r.result).toBe('VALIDO');
    });
});
