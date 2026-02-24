/**
 * =====================================================
 * RESPONSE SELECTOR - LLM ELIGE RESPUESTA Y ESTADO
 * =====================================================
 * Usa OpenAI (o el LLM configurado) para elegir qué respuesta del banco
 * por desarrollo enviar y a qué estado pasar, con contexto opcional de mensajes anteriores.
 */

import { runLLM } from '@/lib/services/llm';
import type { ConversationState } from './conversation-state';
import type { DevelopmentMessages } from './development-content';
import { getMessagesForDevelopment } from './development-content';
import { logger } from '@/lib/utils/logger';

/** Claves del banco de respuestas por desarrollo */
export type ResponseKey = keyof DevelopmentMessages;

const VALID_RESPONSE_KEYS: ResponseKey[] = [
    'BIENVENIDA',
    'CONFIRMACION_COMPRA',
    'CONFIRMACION_INVERSION',
    'CTA_AYUDA',
    'SOLICITUD_HORARIO',
    'SOLICITUD_NOMBRE',
    'INFO_REINTENTO',
    'HANDOVER_EXITOSO',
    'CONFIRMACION_FINAL',
    'SALIDA_ELEGANTE',
    'FUERA_HORARIO',
];

const VALID_STATES: ConversationState[] = [
    'INICIO',
    'FILTRO_INTENCION',
    'INFO_REINTENTO',
    'CTA_PRIMARIO',
    'SOLICITUD_HORARIO',
    'SOLICITUD_NOMBRE',
    'CLIENT_ACCEPTA',
    'SALIDA_ELEGANTE',
];

export interface ResponseSelectionInput {
    development: string;
    currentState: ConversationState;
    userMessage: string;
    /** Mensajes recientes para contexto (último primero) */
    recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    /** Datos del usuario (nombre, intencion, etc.) */
    userData?: Record<string, unknown>;
}

export interface ResponseSelectionResult {
    responseKey: ResponseKey;
    nextState: ConversationState;
}

const RESPONSE_KEY_DESCRIPTIONS: Record<ResponseKey, string> = {
    BIENVENIDA: 'Saludo inicial y pregunta si busca invertir o construir.',
    CONFIRMACION_COMPRA: 'Confirma que busca construir/vivir; ventajas para vivienda.',
    CONFIRMACION_INVERSION: 'Confirma que busca invertir; plusvalía y rentabilidad.',
    CTA_AYUDA: 'Pregunta si prefiere visita o llamada con asesor.',
    SOLICITUD_HORARIO: 'Pide horario preferido para ser contactado o realizar la llamada.',
    SOLICITUD_NOMBRE: 'Pide nombre completo para asignar asesor.',
    INFO_REINTENTO: 'Usuario solo info o no claro; dar datos y preguntar invertir o vivir.',
    HANDOVER_EXITOSO: 'Despedida tras dar nombre; conectar con asesor.',
    CONFIRMACION_FINAL: 'Confirmar visita o llamada.',
    SALIDA_ELEGANTE: 'Usuario no califica o rechaza; despedida amable.',
    FUERA_HORARIO: 'Fuera de horario; asesor continuará después.',
};

/**
 * Usa el LLM para elegir la clave de respuesta del banco y el siguiente estado.
 * Devuelve null si el LLM falla o la respuesta no es válida.
 */
export async function selectResponseAndState(
    input: ResponseSelectionInput
): Promise<ResponseSelectionResult | null> {
    const { development, currentState, userMessage, recentMessages = [], userData = {} } = input;

    const contextBlock =
        recentMessages.length > 0
            ? `Contexto de mensajes recientes (último primero):\n${recentMessages
                .slice(0, 6)
                .map(
                    m =>
                        `${m.role === 'user' ? 'Usuario' : 'Bot'}: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`
                )
                .join('\n')}\n\n`
            : '';

    const userDataBlock =
        Object.keys(userData).length > 0
            ? `Datos del usuario: ${JSON.stringify(userData)}\n\n`
            : '';

    const systemPrompt = `Eres un selector de respuestas para un bot de WhatsApp de bienes raíces.
Desarrollo: ${development}. Estado actual: ${currentState}.

Elige UNA clave de respuesta y el siguiente estado.

Claves disponibles:
${VALID_RESPONSE_KEYS.map(k => `- ${k}: ${RESPONSE_KEY_DESCRIPTIONS[k]}`).join('\n')}

Estados posibles: ${VALID_STATES.join(', ')}

Reglas:
1. Usuario quiere INVERTIR -> CONFIRMACION_INVERSION, nextState CTA_PRIMARIO.
2. Usuario quiere COMPRAR/CONSTRUIR/VIVIR -> CONFIRMACION_COMPRA, nextState CTA_PRIMARIO.
3. Usuario solo INFO/PRECIO (primera vez) -> INFO_REINTENTO, nextState INFO_REINTENTO.
4. Usuario acepta visita/llamada (sí, agendar, etc.) -> SOLICITUD_HORARIO, nextState SOLICITUD_HORARIO.
5. En estado SOLICITUD_HORARIO, usuario indica horario (cualquier texto) -> SOLICITUD_NOMBRE, nextState SOLICITUD_NOMBRE.
6. Usuario rechaza (no gracias, luego) -> SALIDA_ELEGANTE, nextState SALIDA_ELEGANTE.
7. Usuario da su nombre (varias palabras) -> HANDOVER_EXITOSO, nextState CLIENT_ACCEPTA.
8. Mensaje ambiguo en FILTRO_INTENCION -> INFO_REINTENTO, nextState INFO_REINTENTO.
9. Primer mensaje solo saludo (hola) -> BIENVENIDA, nextState FILTRO_INTENCION.
10. NUNCA inventes ni menciones disponibilidad de lotes en específico ni rangos en m²; solo usa las claves del banco.

Responde SOLO un JSON en una línea, sin markdown: {"responseKey":"CLAVE","nextState":"ESTADO"}`;

    const userContent = `${contextBlock}${userDataBlock}Mensaje del usuario: "${userMessage}"\nEstado actual: ${currentState}.\nJSON:`;

    try {
        const response = await runLLM(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            { temperature: 0, max_tokens: 80 }
        );

        const trimmed = response.trim();
        const jsonStr = trimmed.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(jsonStr) as { responseKey?: string; nextState?: string };

        const key = parsed.responseKey;
        const next = parsed.nextState;

        if (
            !key ||
            !next ||
            !VALID_RESPONSE_KEYS.includes(key as ResponseKey) ||
            !VALID_STATES.includes(next as ConversationState)
        ) {
            logger.warn('Response selector invalid key or state', {
                responseKey: key,
                nextState: next,
                development,
            }, 'response-selector');
            return null;
        }

        return {
            responseKey: key as ResponseKey,
            nextState: next as ConversationState,
        };
    } catch (error) {
        logger.error('Error in selectResponseAndState', error, {
            development,
            currentState,
            userMessageLen: userMessage.length,
        }, 'response-selector');
        return null;
    }
}

/**
 * Obtiene el texto de la respuesta por clave y desarrollo.
 * Sustituye {NOMBRE} si se pasa userName.
 */
export function getResponseText(
    development: string,
    responseKey: ResponseKey,
    userName?: string
): string {
    const messages = getMessagesForDevelopment(development);
    const text = messages[responseKey] ?? '';
    if (userName && text.includes('{NOMBRE}')) {
        const firstName = userName.split(' ')[0] || userName;
        const prettyName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        return text.replace(/\{NOMBRE\}/g, prettyName);
    }
    return text.replace(/\s*,\s*\{NOMBRE\}\s*/g, '').replace(/\{NOMBRE\}/g, '');
}
