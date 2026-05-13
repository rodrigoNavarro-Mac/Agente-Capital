/**
 * =====================================================
 * SEMANTIC INTENT CLASSIFICATION
 * =====================================================
 * Clasificación de intenciones usando LLM
 */

import { runLLM } from '@/lib/services/llm';
import type { LMStudioMessage } from '@/types/documents';
import { logger } from '@/lib/utils/logger';

/**
 * Clasifica la intención del usuario (comprar, invertir, solo_info)
 * Se recomienda usar primero matchIntentByKeywords; el LLM es fallback para frases no listadas.
 */
export async function classifyIntent(
    userMessage: string
): Promise<'comprar' | 'invertir' | 'solo_info' | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Eres un clasificador de intenciones para un bot de bienes raíces en México.

Clasifica la respuesta del usuario en UNA de estas categorías:

- comprar: quiere comprar un lote para construir su casa, vivir ahí, tener su hogar. Ejemplos: "quiero un lote", "para construir mi casa", "busco terreno para vivir", "casa propia", "para mi familia".
- invertir: quiere invertir en un lote como patrimonio o negocio, no para vivir. Ejemplos: "invertir", "inversión", "para rentar", "plusvalía", "patrimonio", "lote para invertir".
- solo_info: solo quiere información, precios, explorar, sin compromiso. Ejemplos: "solo información", "cuánto cuesta", "precios", "cotización", "ver opciones", "conocer", "datos".

Responde SOLO con una palabra: "comprar", "invertir" o "solo_info".`,
            },
            {
                role: 'user',
                content: `Respuesta del usuario: "${userMessage}"

Clasificación:`,
            },
        ];

        const response = await runLLM(messages, {
            temperature: 0,
            max_tokens: 15,
        });

        const classification = response.toLowerCase().trim();

        if (classification.includes('comprar')) return 'comprar';
        if (classification.includes('invertir') || classification.includes('inversion')) return 'invertir';
        if (classification.includes('solo') || classification.includes('info')) return 'solo_info';

        logger.warn('Intent classification unclear', { userMessage, response }, 'intent-classifier');
        return null;
    } catch (error) {
        logger.error('Error classifying intent', error, { userMessage }, 'intent-classifier');
        return null;
    }
}

/**
 * Clasifica CTA primario: visitar el desarrollo o ser contactado por un agente.
 * Usar primero matchCtaPrimarioByKeywords; el LLM es fallback.
 */
export async function classifyCtaPrimario(
    userMessage: string
): Promise<'visitar' | 'contactado' | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Clasifica la respuesta del usuario en UNA de estas opciones:

- visitar: quiere visitar el desarrollo, ir a ver, agendar visita, conocer las instalaciones.
- contactado: quiere que un agente lo contacte (por llamada, WhatsApp, etc.), que lo llamen, contacto con asesor.

Responde SOLO: "visitar" o "contactado".`,
            },
            {
                role: 'user',
                content: `Respuesta del usuario: "${userMessage}"

Clasificación:`,
            },
        ];

        const response = await runLLM(messages, {
            temperature: 0,
            max_tokens: 10,
        });

        const classification = response.toLowerCase().trim();
        if (classification.includes('visitar')) return 'visitar';
        if (classification.includes('contactado')) return 'contactado';
        return null;
    } catch (error) {
        logger.error('Error classifying CTA primario', error, { userMessage }, 'intent-classifier');
        return null;
    }
}

/**
 * Clasifica canal de contacto: llamada telefónica o videollamada (solo cuando el usuario eligió "ser contactado").
 * Usar primero matchCtaCanalByKeywords; el LLM es fallback.
 */
export async function classifyCtaCanal(
    userMessage: string
): Promise<'videollamada' | 'llamada' | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Clasifica cómo quiere ser contactado el usuario:

- videollamada: videollamada, video llamada, zoom, meet, por video.
- llamada: llamada telefónica, que lo llamen, por teléfono, llamada normal.

Responde SOLO: "videollamada" o "llamada".`,
            },
            {
                role: 'user',
                content: `Respuesta del usuario: "${userMessage}"

Clasificación:`,
            },
        ];

        const response = await runLLM(messages, {
            temperature: 0,
            max_tokens: 15,
        });

        const classification = response.toLowerCase().trim();
        if (classification.includes('video') || classification.includes('zoom') || classification.includes('meet')) return 'videollamada';
        if (classification.includes('llamada') || classification.includes('telefono')) return 'llamada';
        return null;
    } catch (error) {
        logger.error('Error classifying CTA canal', error, { userMessage }, 'intent-classifier');
        return null;
    }
}
