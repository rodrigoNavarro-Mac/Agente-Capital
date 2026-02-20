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
 */
export async function classifyIntent(
    userMessage: string
): Promise<'comprar' | 'invertir' | 'solo_info' | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Eres un clasificador de intenciones para un bot de bienes raíces.

Clasifica la respuesta del usuario en UNA de estas categorías:
- comprar: quiere comprar un lote para construir su casa
- invertir: quiere invertir en un lote como patrimonio/negocio
- solo_info: solo quiere información, está explorando, no tiene intención de compra

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
            max_tokens: 10,
        });

        const classification = response.toLowerCase().trim();

        if (classification.includes('comprar')) return 'comprar';
        if (classification.includes('invertir')) return 'invertir';
        if (classification.includes('solo')) return 'solo_info';

        logger.warn('Intent classification unclear', { userMessage, response }, 'intent-classifier');
        return null;
    } catch (error) {
        logger.error('Error classifying intent', error, { userMessage }, 'intent-classifier');
        return null;
    }
}

/**
 * Clasifica el perfil de compra del usuario
 */
export async function classifyPerfilCompra(
    userMessage: string
): Promise<'construir_casa' | 'inversion' | 'no_claro' | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Clasifica cómo el usuario piensa usar el lote.

Categorías:
- construir_casa: va a construir su casa/hogar para vivir
- inversion: lo quiere como inversión a futuro, no para vivir
- no_claro: no está seguro, aún no decide

Responde SOLO: "construir_casa", "inversion" o "no_claro".`,
            },
            {
                role: 'user',
                content: `Respuesta: "${userMessage}"

Clasificación:`,
            },
        ];

        const response = await runLLM(messages, {
            temperature: 0,
            max_tokens: 15,
        });

        const classification = response.toLowerCase().trim();

        if (classification.includes('construir')) return 'construir_casa';
        if (classification.includes('inversion')) return 'inversion';
        if (classification.includes('no_claro') || classification.includes('no claro')) return 'no_claro';

        return null;
    } catch (error) {
        logger.error('Error classifying perfil', error, { userMessage }, 'intent-classifier');
        return null;
    }
}

/**
 * Extrae y normaliza el rango de presupuesto
 */
export async function classifyPresupuesto(
    userMessage: string
): Promise<{ range: string; viable: boolean } | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Extrae el rango de presupuesto del mensaje del usuario.

Rangos válidos para FUEGO:
- menos_1.5M: menos de $1.5 millones (NO viable)
- 1.5-2.5M: entre $1.5 y $2.5 millones (viable)
- 2.5-3.5M: entre $2.5 y $3.5 millones (viable)
- mas_3.5M: más de $3.5 millones (viable)
- evaluando: aún lo está evaluando/pensando (viable pero MEDIO)

Responde en formato: "RANGO|viable" o "RANGO|no_viable"
Ejemplos:
- "1.5-2.5M|viable"
- "menos_1.5M|no_viable"
- "evaluando|viable"`,
            },
            {
                role: 'user',
                content: `Respuesta: "${userMessage}"

Formato RANGO|viable:`,
            },
        ];

        const response = await runLLM(messages, {
            temperature: 0,
            max_tokens: 20,
        });

        const parts = response.trim().split('|');
        if (parts.length !== 2) return null;

        const range = parts[0].trim();
        const viable = parts[1].toLowerCase().includes('viable') && !parts[1].toLowerCase().includes('no_viable');

        return { range, viable };
    } catch (error) {
        logger.error('Error classifying presupuesto', error, { userMessage }, 'intent-classifier');
        return null;
    }
}

/**
 * Clasifica la urgencia/timeframe del usuario
 */
export async function classifyUrgencia(
    userMessage: string
): Promise<'0-3m' | '3-6m' | '6-12m' | 'explorando' | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Clasifica el timeframe de decisión del usuario.

Categorías:
- 0-3m: inmediato, 1-3 meses
- 3-6m: corto plazo, 3-6 meses
- 6-12m: mediano plazo, 6-12 meses
- explorando: solo está explorando, sin urgencia real

Responde SOLO: "0-3m", "3-6m", "6-12m" o "explorando".`,
            },
            {
                role: 'user',
                content: `Respuesta: "${userMessage}"

Clasificación:`,
            },
        ];

        const response = await runLLM(messages, {
            temperature: 0,
            max_tokens: 10,
        });

        const classification = response.toLowerCase().trim();

        if (classification.includes('0-3') || classification.includes('0_3')) return '0-3m';
        if (classification.includes('3-6') || classification.includes('3_6')) return '3-6m';
        if (classification.includes('6-12') || classification.includes('6_12')) return '6-12m';
        if (classification.includes('explor')) return 'explorando';

        return null;
    } catch (error) {
        logger.error('Error classifying urgencia', error, { userMessage }, 'intent-classifier');
        return null;
    }
}

/**
 * Clasifica la acción preferida del usuario
 */
export async function classifyAccion(
    userMessage: string
): Promise<'cita' | 'visita' | 'cotizacion' | null> {
    try {
        const messages: LMStudioMessage[] = [
            {
                role: 'system',
                content: `Clasifica qué prefiere el usuario.

Opciones:
- cita: quiere una llamada/cita telefónica
- visita: quiere visitar el desarrollo presencialmente
- cotizacion: quiere recibir cotización por WhatsApp

Responde SOLO: "cita", "visita" o "cotizacion".`,
            },
            {
                role: 'user',
                content: `Respuesta: "${userMessage}"

Clasificación:`,
            },
        ];

        const response = await runLLM(messages, {
            temperature: 0,
            max_tokens: 10,
        });

        const classification = response.toLowerCase().trim();

        if (classification.includes('cita') || classification.includes('llamada')) return 'cita';
        if (classification.includes('visita')) return 'visita';
        if (classification.includes('cotiz')) return 'cotizacion';

        return null;
    } catch (error) {
        logger.error('Error classifying accion', error, { userMessage }, 'intent-classifier');
        return null;
    }
}
