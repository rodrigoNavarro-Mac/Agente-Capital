/**
 * Detección de topic FAQ por reglas de keywords.
 * Rules-first, sin LLM. Robusto a mayúsculas, acentos y textos largos.
 */

import type { FaqTopic } from './faq-types';

/** Normaliza texto: minúsculas + quita acentos */
function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** Retorna true si el texto normalizado contiene alguna de las keywords */
function matchesAny(normalized: string, keywords: string[]): boolean {
    return keywords.some((kw) => normalized.includes(kw));
}

// Prioridad de detección (mayor prioridad primero):
// PRECIOS > M2 > FINANCIAMIENTO > ENTREGA > AMENIDADES > UBICACION > PLURIFAMILIAR
const TOPIC_RULES: Array<{ topic: FaqTopic; keywords: string[] }> = [
    {
        topic: 'PRECIOS',
        keywords: ['precio', 'precios', 'cuesta', 'costo', 'cotiz', 'desde cuanto', 'cuanto vale', 'valor'],
    },
    {
        topic: 'M2',
        keywords: ['m2', 'm²', 'metros', 'metraje', 'superficie', 'medidas', 'desde que m'],
    },
    {
        topic: 'FINANCIAMIENTO',
        keywords: ['financ', 'plazo', 'plazos', 'meses', 'mensual', 'enganche', 'pagos', 'credito'],
    },
    {
        topic: 'ENTREGA',
        keywords: ['entrega', 'marzo', '2026', 'cuando entregan'],
    },
    {
        topic: 'AMENIDADES',
        keywords: ['amenidades', 'casa club', 'gimnasio', 'padel', 'piscina', 'sauna', 'ludoteca', 'yoga'],
    },
    {
        topic: 'UBICACION',
        keywords: ['ubicacion', 'donde esta', 'como llego', 'como se llega', 'como llegar', 'temozon', 'soluna'],
    },
    {
        topic: 'PLURIFAMILIAR',
        keywords: ['plurifamiliar', 'desarrollador', 'desarrolladores', 'cos', 'niveles', 'viviendas', 'altura'],
    },
    // GENERAL: fallback cuando el usuario pide "información" genérica sin especificar topic.
    // Tiene menor prioridad que todos los topics específicos (va al final).
    {
        topic: 'GENERAL',
        keywords: ['informacion', 'info', 'mas info', 'dame info', 'quiero saber', 'que tiene', 'que ofrece'],
    },
];

export function detectFaqTopic(messageText: string): FaqTopic | null {
    const normalized = normalize(messageText);
    for (const { topic, keywords } of TOPIC_RULES) {
        if (matchesAny(normalized, keywords)) {
            return topic;
        }
    }
    return null;
}
