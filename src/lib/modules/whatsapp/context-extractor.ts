/**
 * Extracción de contexto personal/situacional de mensajes entrantes.
 * Corre en paralelo con FAQ/FSM y guarda notas para el asesor en el handover.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/utils/logger';

const client = new Anthropic();

/**
 * Heurística rápida: ¿vale la pena enviar este mensaje al LLM?
 * Evita llamadas innecesarias en mensajes cortos o simples (~80% de los casos).
 */
const RICH_CONTEXT_HINTS = [
    'hija', 'hijo', 'esposa', 'esposo', 'familia', 'para mi', 'para un',
    'mudarse', 'mudara', 'muda', 'vivir', 'trabajar', 'retiro', 'inversi',
    'cdmx', 'ciudad de mexico', 'monterrey', 'guadalajara', 'cancun', 'merida',
    'heredar', 'regalo', 'pensando en', 'nos queremos', 'queremos comprar',
];

function looksLikeRichContext(text: string): boolean {
    const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const wordCount = lower.split(/\s+/).length;
    if (wordCount > 8) return true;
    return RICH_CONTEXT_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Extrae contexto útil para el asesor de un mensaje libre del usuario.
 * Retorna una nota de 1-2 oraciones o null si no hay contexto relevante.
 * Usa claude-haiku-4-5 para mantener latencia y costo bajos.
 */
export async function tryExtractContext(messageText: string): Promise<string | null> {
    if (!looksLikeRichContext(messageText)) return null;

    try {
        const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 120,
            system: `Eres un asistente que extrae información personal relevante de mensajes de WhatsApp de un cliente inmobiliario.
Extrae SOLO información útil para el asesor: para quién es la compra, motivo, situación personal, ubicación de origen/destino, urgencia, etc.
Si el mensaje no contiene contexto personal relevante (ej: "hola", "¿cuánto cuesta?", "ok"), responde exactamente: null
Responde en máximo 2 oraciones cortas en español, sin comillas ni formato adicional.`,
            messages: [{ role: 'user', content: messageText }],
        });
        const text = (response.content[0] as { text: string }).text.trim();
        if (text === 'null' || text.length < 5) return null;
        return text;
    } catch (err) {
        logger.error('context-extractor: LLM call failed', err, {}, 'context-extractor');
        return null;
    }
}
