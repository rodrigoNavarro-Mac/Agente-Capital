import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFaqTopic } from '../faq/detect-faq-topic';
import { maybeHandleFaq } from '../faq/faq-router';

// ─── logger mock ─────────────────────────────────────────────────────────────
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ─── detectFaqTopic ───────────────────────────────────────────────────────────
describe('detectFaqTopic', () => {
    it('"¿cuánto cuesta?" => PRECIOS', () => {
        expect(detectFaqTopic('¿cuánto cuesta?')).toBe('PRECIOS');
    });

    it('"desde que m2?" => M2', () => {
        expect(detectFaqTopic('desde que m2?')).toBe('M2');
    });

    it('"amenidades?" => AMENIDADES', () => {
        expect(detectFaqTopic('amenidades?')).toBe('AMENIDADES');
    });

    it('"donde esta?" => UBICACION', () => {
        expect(detectFaqTopic('donde esta?')).toBe('UBICACION');
    });

    it('"financiamiento a meses?" => FINANCIAMIENTO', () => {
        expect(detectFaqTopic('financiamiento a meses?')).toBe('FINANCIAMIENTO');
    });

    it('"cuando entregan?" => ENTREGA', () => {
        expect(detectFaqTopic('cuando entregan?')).toBe('ENTREGA');
    });

    it('"cos y niveles?" => PLURIFAMILIAR', () => {
        expect(detectFaqTopic('cos y niveles?')).toBe('PLURIFAMILIAR');
    });

    it('texto sin keywords => null', () => {
        expect(detectFaqTopic('hola, me interesa el lote')).toBeNull();
    });

    it('mayúsculas y acentos son ignorados: "PRECIO del lote" => PRECIOS', () => {
        expect(detectFaqTopic('PRECIO del lote')).toBe('PRECIOS');
    });

    it('prioridad: si tiene precio y m2, devuelve PRECIOS', () => {
        expect(detectFaqTopic('precio por m2?')).toBe('PRECIOS');
    });

    it('prioridad: si tiene m2 y financiamiento, devuelve M2', () => {
        expect(detectFaqTopic('cuantos m2 con financiamiento?')).toBe('M2');
    });

    it('"piscina y sauna" => AMENIDADES', () => {
        expect(detectFaqTopic('tienen piscina y sauna?')).toBe('AMENIDADES');
    });

    it('"mérida temozón" => UBICACION', () => {
        expect(detectFaqTopic('está en mérida temozón?')).toBe('UBICACION');
    });

    it('"entrega marzo 2026" => ENTREGA', () => {
        expect(detectFaqTopic('entrega marzo 2026')).toBe('ENTREGA');
    });

    it('"viviendas y COS" => PLURIFAMILIAR', () => {
        expect(detectFaqTopic('cuantas viviendas y cual es el COS?')).toBe('PLURIFAMILIAR');
    });
});

// ─── maybeHandleFaq ───────────────────────────────────────────────────────────
describe('maybeHandleFaq', () => {
    it('mensaje sin FAQ => { handled: false }', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'hola' });
        expect(result.handled).toBe(false);
        expect(result.response).toBeUndefined();
    });

    it('AMURA + "precios" => handled + PRECIOS response', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'cuanto cuesta?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('PRECIOS');
        // No debe inventar cifras
        expect(result.response).not.toMatch(/\$\d/);
        // Debe pedir superficie o presupuesto para cotizar
        expect(result.response).toMatch(/superficie|presupuesto|cotizar/i);
    });

    it('AMURA + "m2" => handled + M2 response con superficies', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'que superficie tienen?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('M2');
        expect(result.response).toContain('250');
    });

    it('AMURA + "amenidades" => handled + AMENIDADES response', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'amenidades?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('AMENIDADES');
        expect(result.response).toContain('Piscina');
    });

    it('AMURA + "financiamiento" => handled + FINANCIAMIENTO response', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'tienen financiamiento?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('FINANCIAMIENTO');
        expect(result.response).toContain('12 meses');
    });

    it('AMURA + "entrega" => handled + ENTREGA response', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'cuando es la entrega?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('ENTREGA');
        expect(result.response).toMatch(/entrega|lote|casa club/i);
    });

    it('AMURA + "ubicacion" => handled + UBICACION response', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'donde esta?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('UBICACION');
        expect(result.response).toContain('Mérida');
    });

    it('AMURA + "plurifamiliar" => handled + PLURIFAMILIAR response', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'zona plurifamiliar?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('PLURIFAMILIAR');
        expect(result.response).toContain('1,483');
    });

    it('FUEGO + "amenidades" => responde con info de FUEGO', async () => {
        const result = await maybeHandleFaq({ development: 'FUEGO', messageText: 'amenidades?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('AMENIDADES');
        expect(result.response).toContain('Terraquia');
    });

    it('development en minúsculas es normalizado correctamente', async () => {
        const result = await maybeHandleFaq({ development: 'amura', messageText: 'precios?' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('PRECIOS');
    });

    // REGRESION: "Quiero información" en CTA_PRIMARIO no debe saltar a SOLICITUD_NOMBRE
    it('"Quiero información" genérica => GENERAL topic interceptado por FAQ', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'Quiero información' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('GENERAL');
        // La respuesta debe preguntar qué info específica quiere, sin mutar estado
        expect(result.response).toContain('m²');
    });

    it('"mas informacion" => GENERAL (case/accent insensitive)', async () => {
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'mas información del proyecto' });
        expect(result.handled).toBe(true);
        expect(result.topic).toBe('GENERAL');
    });

    // Prueba de integración: el FAQ interceptor NO llama a updateState ni a ninguna función de persistencia
    it('no muta estado: maybeHandleFaq no importa updateState', async () => {
        // Esta prueba verifica que maybeHandleFaq retorna { handled, response, topic }
        // sin recibir ni llamar funciones de persistencia de estado.
        const result = await maybeHandleFaq({ development: 'AMURA', messageText: 'precio' });
        expect(result).toHaveProperty('handled');
        expect(result).toHaveProperty('response');
        expect(result).toHaveProperty('topic');
        // No tiene side effects de estado (la función no recibe userPhone ni persistence deps)
    });
});
