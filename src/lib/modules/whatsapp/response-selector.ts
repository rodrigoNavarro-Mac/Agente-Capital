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

/**
 * Lista de claves válidas derivada del banco de contenido (development-content).
 * Si agregas o quitas una clave en DevelopmentMessages, esta lista se actualiza sola.
 */
const VALID_RESPONSE_KEYS: ResponseKey[] = Object.keys(
    getMessagesForDevelopment('FUEGO')
) as ResponseKey[];

const VALID_STATES: ConversationState[] = [
    'INICIO',
    'FILTRO_INTENCION',
    'INFO_REINTENTO',
    'CTA_PRIMARIO',
    'CTA_CANAL',
    'SOLICITUD_HORARIO',
    'SOLICITUD_NOMBRE',
    'CLIENT_ACCEPTA',
    'SALIDA_ELEGANTE',
];

/**
 * Configuración por estado activo: opciones válidas para el LLM selector.
 * Reduce las opciones que ve el LLM de 15+ a 3-5 por estado, evitando que
 * elija estados o claves legacy/inválidos para el contexto actual.
 */
const STATE_LLM_CONFIG: Partial<Record<ConversationState, {
    validResponseKeys: ResponseKey[];
    validNextStates: ConversationState[];
    stateContext: string;
}>> = {
    FILTRO_INTENCION: {
        validResponseKeys: ['CONFIRMACION_COMPRA', 'CONFIRMACION_INVERSION', 'INFO_REINTENTO', 'SALIDA_ELEGANTE'],
        validNextStates: ['CTA_PRIMARIO', 'INFO_REINTENTO', 'SALIDA_ELEGANTE'],
        stateContext: 'El bot preguntó qué le interesa al usuario (comprar, invertir, o solo información).',
    },
    INFO_REINTENTO: {
        validResponseKeys: ['CONFIRMACION_COMPRA', 'CONFIRMACION_INVERSION', 'CTA_VISITA_O_CONTACTO', 'SALIDA_ELEGANTE'],
        validNextStates: ['CTA_PRIMARIO', 'SALIDA_ELEGANTE'],
        stateContext: 'El bot dio información adicional y preguntó si hay interés en avanzar.',
    },
    CTA_PRIMARIO: {
        // SOLICITUD_NOMBRE está disponible SOLO para el short-circuit "llamada" (canal explícito).
        // Los mensajes de info genérica ("Quiero información") son interceptados por el FAQ router
        // ANTES de llegar aquí, por lo que el LLM ya no los ve.
        validResponseKeys: ['CTA_CANAL', 'SOLICITUD_HORARIO', 'SOLICITUD_NOMBRE', 'SALIDA_ELEGANTE'],
        validNextStates: ['SOLICITUD_HORARIO', 'CTA_CANAL', 'SOLICITUD_NOMBRE', 'SALIDA_ELEGANTE'],
        stateContext: 'El bot preguntó si el usuario quiere visitar el desarrollo o que un asesor lo contacte. Si el usuario dice "llamada" (teléfono) directamente → SOLICITUD_NOMBRE. Si dice "visitar" → SOLICITUD_HORARIO. Si es genérico o dice "contactar" sin canal → CTA_CANAL. Si rechaza → SALIDA_ELEGANTE.',
    },
    CTA_CANAL: {
        validResponseKeys: ['SOLICITUD_HORARIO', 'SOLICITUD_NOMBRE', 'SALIDA_ELEGANTE'],
        validNextStates: ['SOLICITUD_HORARIO', 'SOLICITUD_NOMBRE', 'SALIDA_ELEGANTE'],
        stateContext: 'El bot preguntó si prefiere llamada telefónica o videollamada.',
    },
    SOLICITUD_HORARIO: {
        validResponseKeys: ['SOLICITUD_NOMBRE'],
        validNextStates: ['SOLICITUD_NOMBRE'],
        stateContext: 'El bot pidió el horario o fecha preferida de contacto/visita.',
    },
    SOLICITUD_NOMBRE: {
        validResponseKeys: ['HANDOVER_EXITOSO', 'SOLICITUD_NOMBRE'],
        validNextStates: ['CLIENT_ACCEPTA', 'SOLICITUD_NOMBRE'],
        stateContext: 'El bot pidió el nombre completo del usuario.',
    },
};

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
    FILTRO_PREGUNTA: 'Re-pregunta corta de intención (invertir o construir) cuando el usuario solo saluda.',
    CONFIRMACION_COMPRA: 'Confirma que busca construir/vivir; ventajas para vivienda.',
    CONFIRMACION_INVERSION: 'Confirma que busca invertir; plusvalía y rentabilidad.',
    CTA_AYUDA: 'Pregunta si prefiere visita o llamada con asesor.',
    CTA_VISITA_O_CONTACTO: 'Pregunta si quiere visitar el desarrollo o que un agente lo contacte.',
    CTA_CANAL: 'Pregunta por llamada telefónica o videollamada (solo si eligió ser contactado).',
    SOLICITUD_HORARIO: 'Pide horario preferido para ser contactado o realizar la llamada.',
    SOLICITUD_FECHA_HORARIO: 'Pide día y horario para agendar videollamada.',
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

    const stateConfig = STATE_LLM_CONFIG[currentState];
    const effectiveResponseKeys = stateConfig?.validResponseKeys ?? VALID_RESPONSE_KEYS;
    const effectiveNextStates = stateConfig?.validNextStates ?? VALID_STATES;
    const stateContextLine = stateConfig?.stateContext
        ? `Contexto del estado: ${stateConfig.stateContext}`
        : '';

    const systemPrompt = `Eres un selector de respuestas para un bot de WhatsApp de bienes raíces.
Desarrollo: ${development}. Estado actual: ${currentState}.
${stateContextLine}

El usuario acaba de responder. Elige UNA clave de respuesta y el siguiente estado.

Claves disponibles para este estado:
${effectiveResponseKeys.map(k => `- ${k}: ${RESPONSE_KEY_DESCRIPTIONS[k]}`).join('\n')}

Estados posibles para este estado: ${effectiveNextStates.join(', ')}

Reglas:
- Si el usuario da su nombre (2+ palabras o texto con nombre propio) -> HANDOVER_EXITOSO, CLIENT_ACCEPTA.
- Si el usuario rechaza o dice "no gracias" -> SALIDA_ELEGANTE.
- Si el usuario indica visita -> el nextState asociado a horario.
- Si el usuario da un horario/fecha -> siguiente estado de nombre.
- En SOLICITUD_NOMBRE, si el texto < 3 caracteres -> re-pedir nombre (SOLICITUD_NOMBRE, SOLICITUD_NOMBRE).
- Elige SOLO entre las opciones listadas arriba. No inventes claves ni estados.

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
            !effectiveResponseKeys.includes(key as ResponseKey) ||
            !effectiveNextStates.includes(next as ConversationState)
        ) {
            logger.warn('Response selector invalid key or state', {
                responseKey: key,
                nextState: next,
                currentState,
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
