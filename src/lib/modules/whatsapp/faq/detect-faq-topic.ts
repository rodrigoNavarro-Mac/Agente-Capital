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
        keywords: [
            'precio', 'precios', 'cuesta', 'cuanto sale', 'cuanto estan', 'cuanto valen',
            'costo', 'cotiz', 'desde cuanto', 'cuanto vale', 'valor', 'cuanto es',
            'cuanto cuesta', 'a cuanto', 'rango de precio',
        ],
    },
    {
        topic: 'M2',
        keywords: ['m2', 'm²', 'metros', 'metraje', 'superficie', 'medidas', 'desde que m', 'tamano', 'tamanio', 'que tan grande'],
    },
    {
        topic: 'FINANCIAMIENTO',
        keywords: [
            'financ', 'plazo', 'plazos', 'meses', 'mensual', 'mensualidad',
            'enganche', 'pagos', 'credito', 'forma de pago', 'como se paga',
            'contado', 'abonos', 'apartado', 'separar', 'como funciona el pago',
        ],
    },
    {
        topic: 'ENTREGA',
        keywords: ['entrega', 'cuando entregan', 'cuando esta listo', 'disponibilidad', 'inmediata', 'ya esta'],
    },
    {
        topic: 'AMENIDADES',
        keywords: ['amenidades', 'casa club', 'gimnasio', 'padel', 'piscina', 'alberca', 'sauna', 'ludoteca', 'yoga', 'areas comunes', 'instalaciones'],
    },
    {
        topic: 'UBICACION',
        keywords: [
            'ubicacion', 'donde esta', 'donde queda', 'donde se encuentra',
            'como llego', 'como se llega', 'como llegar', 'direccion',
            'temozon', 'soluna', 'huayacan', 'terraquia',
        ],
    },
    {
        topic: 'PLURIFAMILIAR',
        keywords: ['plurifamiliar', 'desarrollador', 'desarrolladores', 'cos', 'niveles', 'viviendas', 'altura'],
    },
    // GENERAL: fallback cuando el usuario pide "información" genérica sin especificar topic.
    // Tiene menor prioridad que todos los topics específicos (va al final).
    {
        topic: 'GENERAL',
        keywords: ['informacion', 'info', 'mas info', 'dame info', 'quiero saber', 'que tiene', 'que ofrece', 'cuentame'],
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
