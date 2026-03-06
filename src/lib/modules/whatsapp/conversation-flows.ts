/**
 * =====================================================
 * WHATSAPP CONVERSATION FLOWS - FUEGO CANONICAL (HUMANIZED + NAME)
 * =====================================================
 * Flujo de calificación de leads simplificado y optimizado.
 * ENFOQUE UX: Empático, natural, sin prisa.
 */

import type { ConversationState, UserData } from './conversation-state';
import {
    getConversation,
    upsertConversation,
    updateState,
    mergeUserData,
    markQualified,
    resetConversation,
} from './conversation-state';
import {
    classifyIntent,
    classifyCtaPrimario,
    classifyCtaCanal,
} from './intent-classifier';
import {
    matchIntentByKeywords,
    matchAffirmativeByKeywords,
    matchNegativeByKeywords,
    matchCtaPrimarioByKeywords,
    matchCtaCanalByKeywords,
    isOnlyGreeting,
} from './conversation-keywords';
import { getMessagesForDevelopment } from './development-content';
import { getHeroImage, getBrochure, getBrochureFilename } from './media-handler';
import { selectResponseAndState, getResponseText, type ResponseKey } from './response-selector';
import { logger } from '@/lib/utils/logger';
import { createZohoLeadRecord, searchZohoLeadsByPhone, getZohoLeadById } from '@/lib/services/zoho-crm';
import { createCliqChannel, addBotToCliqChannel, postMessageToCliqViaWebhook } from '@/lib/services/zoho-cliq';
import { upsertWhatsAppCliqThread, getCliqThreadByUserAndDev, markContextSent } from '@/lib/db/whatsapp-cliq';
import { saveBridgeLog, saveStateTransition } from '@/lib/db/postgres';
import { getPhoneNumberIdByDevelopment } from './channel-router';
import { maybeHandleFaq } from './faq/faq-router';
import { tryExtractContext } from './context-extractor';
import { personalizeResponse } from './response-personalizer';

// Imports Legacy (reservados para uso futuro)
// import { classifyPerfilCompra, classifyPresupuesto, classifyUrgencia } from './intent-classifier';

/**
 * Mensaje saliente del bot (texto, imagen o documento PDF)
 */
export interface OutboundMessage {
    type: 'text' | 'image' | 'document';
    text?: string;
    imageUrl?: string;
    caption?: string;
    /** URL pública del PDF (solo para type === 'document') */
    documentUrl?: string;
    /** Nombre del archivo con extensión, ej. Brochure-FUEGO.pdf */
    filename?: string;
}

/**
 * Resultado del procesamiento del mensaje
 */
export interface FlowResult {
    outboundMessages: OutboundMessage[];
    nextState?: ConversationState;
    shouldCreateLead?: boolean;
}

/**
 * Contexto del mensaje entrante
 */
export interface IncomingMessageContext {
    development: string;
    zone: string;
    phoneNumberId: string;
    userPhone: string;
    messageText: string;
}

// =====================================================
// HELPER: Registrar transición de estado (fire-and-forget)
// =====================================================

function logTransition(
    userPhone: string,
    development: string,
    fromState: string | null,
    toState: string,
    triggerMessage: string | undefined,
    responseKey: string | undefined,
    triggeredBy: 'llm' | 'keyword' | 'fsm' | 'anti_loop' | 'reset' | 'system',
    reasoning?: string
): void {
    saveStateTransition({
        user_phone: userPhone,
        development,
        from_state: fromState,
        to_state: toState,
        trigger_message: triggerMessage ?? null,
        response_key: responseKey ?? null,
        triggered_by: triggeredBy,
        reasoning: reasoning ?? null,
    }).catch(() => {});
}

// =====================================================
// ALLOWLIST: nextState permitidos por estado actual (evita ciclos y retrocesos)
// =====================================================
const ALLOWED_NEXT_STATES_BY_STATE: Record<ConversationState, ConversationState[]> = {
    INICIO: ['FILTRO_INTENCION'],
    FILTRO_INTENCION: ['CTA_PRIMARIO', 'INFO_REINTENTO', 'SALIDA_ELEGANTE'],
    INFO_REINTENTO: ['CTA_PRIMARIO', 'SALIDA_ELEGANTE'],
    CTA_PRIMARIO: ['SOLICITUD_HORARIO', 'SOLICITUD_NOMBRE', 'CTA_CANAL', 'SALIDA_ELEGANTE'],
    CTA_CANAL: ['SOLICITUD_HORARIO', 'SOLICITUD_NOMBRE', 'SALIDA_ELEGANTE'],
    SOLICITUD_HORARIO: ['SOLICITUD_NOMBRE'],
    SOLICITUD_NOMBRE: ['CLIENT_ACCEPTA', 'SOLICITUD_NOMBRE'],
    CLIENT_ACCEPTA: [],
    ENVIO_BROCHURE: ['INICIO'],
    REVALIDACION_INTERES: ['INICIO'],
    VALIDACION_PRODUCTO: ['INICIO'],
    PERFIL_COMPRA: ['INICIO'],
    CALIFICACION_PRESUPUESTO: ['INICIO'],
    OFERTA_PLAN_PAGOS: ['INICIO'],
    CALIFICACION_URGENCIA: ['INICIO'],
    SOLICITUD_ACCION: ['INICIO'],
    HANDOVER_ASESOR: ['INICIO'],
    SALIDA_ELEGANTE: [],
    CONVERSACION_LIBRE: [],
};

/** responseKeys que repiten la pregunta del estado actual; si LLM devuelve state igual + esta clave, usar FSM (anti-repeat) */
const REPEAT_RESPONSE_KEYS_BY_STATE: Partial<Record<ConversationState, string[]>> = {
    CTA_PRIMARIO: ['CTA_AYUDA', 'CTA_VISITA_O_CONTACTO'],
    CTA_CANAL: ['CTA_CANAL'],
    INFO_REINTENTO: ['INFO_REINTENTO'],
    SOLICITUD_NOMBRE: ['SOLICITUD_NOMBRE'],
};

// =====================================================
// CONFIGURACIÓN HORARIA
// =====================================================

export function isBusinessHours(): boolean {
    // Horario laboral: 09:00 - 18:00 (Cancún Time - America/Cancun)
    const now = new Date();
    const cancunTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Cancun' }));
    const _hours = cancunTime.getHours();

    // TEMPORAL: Retornar false para permitir pruebas inmediatas
    // return hours >= 9 && hours < 18;
    return false;
}

/** Resolves assigned agent email for Cliq invite: from Zoho Owner or env fallback by development */
function getAssignedAgentEmail(ownerEmail?: string | null, development?: string): string | null {
    if (ownerEmail && ownerEmail.trim()) return ownerEmail.trim();
    try {
        const raw = process.env.CLIQ_AGENT_BY_DEVELOPMENT;
        if (!raw) return null;
        const map = JSON.parse(raw) as Record<string, string>;
        return map[development || ''] || null;
    } catch {
        return null;
    }
}

/** Emails to add to every Cliq channel (monitoreo). Env: CLIQ_ALWAYS_INVITE_EMAILS, comma-separated. */
function getCliqAlwaysInviteEmails(): string[] {
    const raw = (process.env.CLIQ_ALWAYS_INVITE_EMAILS || '').trim();
    if (!raw) return [];
    return raw.split(',').map((e) => e.trim()).filter((e) => e.length > 0);
}

/** Comprueba que un string parezca un email válido (Cliq solo acepta emails en email_ids). */
function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

/** Builds a unique channel name for Cliq (guiones; evita "operation_failed" por caracteres no permitidos). */
function buildUniqueCliqChannelName(development: string, firstName: string, userPhone: string): string {
    const base = `WA - ${development} - ${firstName} - ${userPhone.replace(/\s/g, '')}`;
    const suffix = Date.now().toString(36);
    return `${base}_${suffix}`;
}

/** Builds the full list of email_ids for createCliqChannel: assigned agent + always-invite (monitor). Solo incluye emails válidos. */
function buildCliqChannelInviteEmails(assignedAgentEmail: string | null): string[] {
    const always = getCliqAlwaysInviteEmails();
    const combined = Array.from(new Set([assignedAgentEmail, ...always].filter(Boolean) as string[]));
    return combined.filter((e) => isValidEmail(e));
}

// =====================================================
// FLUJO PRINCIPAL
// =====================================================

export async function handleIncomingMessage(
    context: IncomingMessageContext
): Promise<FlowResult> {
    const { development, zone: _zone, userPhone, messageText } = context;

    // 1. DESARROLLO: Detectar comando /reset
    if (messageText.trim().toLowerCase() === '/reset') {
        console.log('[handleIncomingMessage] /reset received for', development, userPhone.substring(0, 6) + '***');
        logger.info('/reset command: calling resetConversation', { userPhone: userPhone.substring(0, 6) + '***', development }, 'conversation-flows');
        const convBefore = await getConversation(userPhone, development);
        const resetOk = await resetConversation(userPhone, development);
        logTransition(userPhone, development, convBefore?.state ?? null, 'INICIO', messageText, undefined, 'reset', 'Comando /reset manual');
        console.log('[handleIncomingMessage] /reset done, resetOk=', resetOk);
        logger.info('/reset command: done', { resetOk }, 'conversation-flows');
        return {
            outboundMessages: [{ type: 'text', text: '🔄 Conversación reiniciada (Modo Humanizado + Nombre).' }]
        };
    }

    // 2. Obtener conversación
    let conversation = await getConversation(userPhone, development);
    console.log('[handleIncomingMessage] getConversation result: state=', conversation?.state ?? 'NULL', '| userData=', conversation?.user_data ? JSON.stringify(conversation.user_data).substring(0, 150) : 'null');
    logger.info('handleIncomingMessage: conversation loaded', {
        found: !!conversation,
        state: conversation?.state ?? 'NULL',
        isQualified: conversation?.is_qualified ?? false,
        stuck: (conversation?.user_data as Record<string, unknown>)?.stuck_in_state_count ?? 0,
        userPhone: userPhone.substring(0, 6) + '***',
        development,
    }, 'conversation-flows');

    logger.info('Conversation state loaded', {
        userPhone: userPhone.substring(0, 5) + '***',
        development,
        state: conversation?.state ?? 'NEW',
        isQualified: conversation?.is_qualified ?? false,
    }, 'conversation-flows');

    console.log('[WhatsApp] state=', conversation?.state ?? 'NEW', '| Si siempre NEW, ejecuta migracion 037');

    // 3. CONTROL POR HORARIO
    if (isBusinessHours()) {
        if (conversation?.is_qualified || conversation?.state === 'CLIENT_ACCEPTA') {
            return { outboundMessages: [] };
        }
        const messages = getMessagesForDevelopment(development);
        return {
            outboundMessages: [{ type: 'text', text: messages.FUERA_HORARIO }]
        };
    }

    // FUERA DE HORARIO LAABORAL -> EJECUTAR FLUJO FSM

    if (!conversation) {
        conversation = await upsertConversation(userPhone, development, {
            state: 'INICIO',
            user_data: {},
            is_qualified: false,
        });

        // Si la DB falla (ej. Vercel sin Postgres o timeout), upsert devuelve null.
        // En ese caso la tabla whatsapp_conversations puede no existir (ejecutar migración 037).
        if (!conversation) {
            logger.warn('Conversation upsert failed (DB unavailable or table whatsapp_conversations missing?). Sending welcome without persisting state.', { userPhone, development }, 'conversation-flows');
            const messages = getMessagesForDevelopment(development);
            console.warn('[WhatsApp] upsertConversation fallo (tabla whatsapp_conversations falta?). Ejecuta migracion 037.');
            return {
                outboundMessages: [{ type: 'text', text: messages.BIENVENIDA }],
            };
        }

        // Si el primer mensaje ya expresa intención (invertir/comprar/info), responder a eso en vez de solo bienvenida
        // Pero si es solo un saludo, enviar bienvenida directamente sin clasificar
        if (isOnlyGreeting(messageText)) {
            logger.info('New conversation: greeting-first, sending welcome', { userPhone: userPhone.substring(0, 5) + '***', development }, 'conversation-flows');
            logTransition(userPhone, development, null, 'FILTRO_INTENCION', messageText, 'BIENVENIDA', 'system', 'Nueva conversación - saludo inicial');
            return await handleInicio(development, userPhone);
        }
        const firstMessageIntent = matchIntentByKeywords(messageText);
        const firstIntent = firstMessageIntent ?? await classifyIntent(messageText);
        const firstIsAlta = firstIntent === 'comprar' || firstIntent === 'invertir' || firstIntent === 'mixto';
        if (firstIsAlta || firstIntent === 'solo_info') {
            logTransition(userPhone, development, null, 'FILTRO_INTENCION', messageText, undefined, 'system', 'Nueva conversación - primer mensaje con intención');
            await updateState(userPhone, development, 'FILTRO_INTENCION');
            return withPersonalization(messageText, await processState('FILTRO_INTENCION', messageText, context, conversation.user_data || {}));
        }

        logger.info('New conversation created', { userPhone: userPhone.substring(0, 5) + '***', development }, 'conversation-flows');
        return await handleInicio(development, userPhone);
    }

    // Si el usuario ya esta calificado / en handover, el bot no responde: la conversacion es asesor-cliente (Cliq <-> WA).
    if (conversation.state === 'CLIENT_ACCEPTA' || conversation.is_qualified) {
        return {
            outboundMessages: [],
            nextState: 'CLIENT_ACCEPTA',
        };
    }

    if (conversation.state === 'SALIDA_ELEGANTE') {
        logTransition(userPhone, development, 'SALIDA_ELEGANTE', 'FILTRO_INTENCION', messageText, 'BIENVENIDA', 'system', 'Nuevo mensaje tras salida elegante - reinicio automático');
        await updateState(userPhone, development, 'INICIO');
        return await handleInicio(development, userPhone);
    }

    // FAQ INTERCEPTOR + extracción de contexto (en paralelo, sin bloquear respuesta)
    const [faqResult, contextNote] = await Promise.all([
        maybeHandleFaq({ development, messageText }),
        tryExtractContext(messageText),
    ]);

    if (contextNote) {
        const existing = conversation.user_data?.notas_contexto;
        const merged = existing ? `${existing} | ${contextNote}` : contextNote;
        mergeUserData(userPhone, development, { notas_contexto: merged }).catch(() => {});
    }

    if (faqResult.handled && faqResult.response) {
        // Guardar el topic FAQ en userData para que el FSM tenga contexto en el siguiente mensaje
        mergeUserData(userPhone, development, { last_faq_topic: faqResult.topic }).catch(() => {});

        const faqMessages: OutboundMessage[] = [];
        const { locationMedia } = faqResult;

        if (locationMedia?.imageUrl) {
            // Imagen de ubicación con texto FAQ como caption
            faqMessages.push({ type: 'image', imageUrl: locationMedia.imageUrl, caption: faqResult.response });
        } else {
            faqMessages.push({ type: 'text', text: faqResult.response });
        }
        if (locationMedia?.mapsUrl) {
            faqMessages.push({ type: 'text', text: `📍 Ver en Maps: ${locationMedia.mapsUrl}` });
        }

        return withPersonalization(messageText, { outboundMessages: faqMessages });
    }

    return withPersonalization(messageText, await processState(conversation.state, messageText, context, conversation.user_data));
}

/**
 * Aplica personalización emocional al primer mensaje de un FlowResult.
 * No modifica mensajes vacíos ni estados de handover.
 */
async function withPersonalization(messageText: string, result: FlowResult): Promise<FlowResult> {
    const msg = result.outboundMessages[0];
    if (!msg) return result;
    if (msg.type === 'text' && msg.text) {
        msg.text = await personalizeResponse(messageText, msg.text);
    } else if (msg.type === 'image' && msg.caption) {
        msg.caption = await personalizeResponse(messageText, msg.caption);
    }
    return result;
}

/**
 * Construye la lista de mensajes salientes a partir de la selección del LLM (banco por desarrollo).
 * Incluye hero image para BIENVENIDA y brochure + CTA para CONFIRMACION_* cuando aplique.
 */
function buildOutboundFromSelection(
    development: string,
    responseKey: ResponseKey,
    _nextState: ConversationState,
    userName?: string
): OutboundMessage[] {
    const messages = getMessagesForDevelopment(development);
    const outbound: OutboundMessage[] = [];

    const text = getResponseText(development, responseKey, userName);

    if (responseKey === 'CONFIRMACION_COMPRA' || responseKey === 'CONFIRMACION_INVERSION') {
        // Fusionar confirmación + CTA en un solo mensaje para evitar desorden de entrega
        const cta = messages.CTA_VISITA_O_CONTACTO ?? messages.CTA_AYUDA;
        const combined = `${text}\n\n${cta}`;
        const heroUrl = getHeroImage(development);
        outbound.push(heroUrl
            ? { type: 'image', imageUrl: heroUrl, caption: combined }
            : { type: 'text', text: combined });
    } else if (responseKey === 'BIENVENIDA') {
        const heroUrl = getHeroImage(development);
        outbound.push(heroUrl
            ? { type: 'image', imageUrl: heroUrl, caption: text }
            : { type: 'text', text });
    } else {
        outbound.push({ type: 'text', text });
    }

    return outbound;
}

async function processState(
    state: ConversationState,
    messageText: string,
    context: IncomingMessageContext,
    userData: UserData
): Promise<FlowResult> {
    const { development, userPhone } = context;

    // ANTI-LOOP: si el usuario lleva 3+ mensajes sin avanzar de estado -> forzar SALIDA_ELEGANTE
    const stuckCount = (userData.stuck_in_state_count as number) ?? 0;
    if (stuckCount >= 3) {
        logger.warn('Anti-loop: stuck_in_state_count >= 3, forcing SALIDA_ELEGANTE', { state, stuckCount, userPhone: userPhone.substring(0, 5) + '***' }, 'conversation-flows');
        await mergeUserData(userPhone, development, { stuck_in_state_count: 0 });
        logTransition(userPhone, development, state, 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'anti_loop', `Anti-loop activado tras ${stuckCount} mensajes sin avanzar`);
        return await handleSalidaElegante(development, userPhone, 'loop_detected');
    }

    const result = await processStateCore(state, messageText, context, userData);

    // Actualizar contador de atasco: incrementar si el estado no avanzó, resetear si avanzó
    const stuckPatch = result.nextState === state
        ? { stuck_in_state_count: stuckCount + 1 }
        : { stuck_in_state_count: 0 };
    await mergeUserData(userPhone, development, stuckPatch);

    return result;
}

async function processStateCore(
    state: ConversationState,
    messageText: string,
    context: IncomingMessageContext,
    userData: UserData
): Promise<FlowResult> {
    const { development, userPhone } = context;

    logger.info('Processing state', { state, development, userPhone: userPhone.substring(0, 5) + '***' }, 'conversation-flows');

    // Opción: usar LLM para elegir respuesta del banco y siguiente estado (con contexto de mensajes si se agrega después)
    const useLLMSelector = ['FILTRO_INTENCION', 'INFO_REINTENTO', 'CTA_PRIMARIO', 'SOLICITUD_HORARIO', 'SOLICITUD_NOMBRE'].includes(state);
    if (useLLMSelector) {
        try {
            const selection = await selectResponseAndState({
                development,
                currentState: state,
                userMessage: messageText,
                userData: userData as Record<string, unknown>,
            });
            if (selection) {
                const { responseKey, nextState } = selection;

                // Validación allowlist: nextState debe estar permitido desde state
                const allowed = ALLOWED_NEXT_STATES_BY_STATE[state];
                const allowlistOk = !allowed || allowed.length === 0 || allowed.includes(nextState);
                const repeatKeys = REPEAT_RESPONSE_KEYS_BY_STATE[state];
                const isRepeat = nextState === state && repeatKeys?.includes(responseKey);
                // En CTA_PRIMARIO no aceptar CONFIRMACION_*: repetiría el mensaje de confirmación (contexto de FILTRO_INTENCION)
                const wrongResponseForState =
                    state === 'CTA_PRIMARIO' &&
                    (responseKey === 'CONFIRMACION_COMPRA' || responseKey === 'CONFIRMACION_INVERSION');
                if (!allowlistOk) {
                    logger.warn('LLM nextState not in allowlist, using FSM fallback', { state, nextState, responseKey }, 'conversation-flows');
                } else if (isRepeat) {
                    logger.info('Anti-repeat: same state + repeat responseKey, using FSM fallback', { state, responseKey }, 'conversation-flows');
                } else if (wrongResponseForState) {
                    logger.warn('LLM returned CONFIRMACION_* in CTA_PRIMARIO (would repeat confirmation), using FSM fallback', { state, responseKey }, 'conversation-flows');
                } else {
                if (responseKey === 'HANDOVER_EXITOSO' && nextState === 'CLIENT_ACCEPTA') {
                    const userName =
                        state === 'SOLICITUD_NOMBRE' && messageText.trim().length >= 3
                            ? messageText.trim()
                            : userData?.nombre;
                    if (state === 'SOLICITUD_NOMBRE' && userName) {
                        await mergeUserData(userPhone, development, { name: userName });
                    }
                    logTransition(userPhone, development, state, 'CLIENT_ACCEPTA', messageText, 'HANDOVER_EXITOSO', 'llm', selection.reasoning ?? `Nombre recibido: ${userName ? userName.substring(0, 30) : 'no indicado'}`);
                    const brochureUrl = getBrochure(development);
                    const brochureMessages: OutboundMessage[] = brochureUrl
                        ? [{
                            type: 'document',
                            documentUrl: brochureUrl,
                            filename: getBrochureFilename(development),
                            caption: 'Aquí está la información del desarrollo.',
                        }]
                        : [];
                    const handoverResult = await handleClientAccepta(
                        development,
                        userPhone,
                        messageText.trim() || 'nombre_proporcionado',
                        userName,
                        context.phoneNumberId,
                        userData,
                        true // skipTransitionLog: ya se registró arriba con triggered_by='llm'
                    );
                    handoverResult.outboundMessages = [...brochureMessages, ...handoverResult.outboundMessages];
                    return handoverResult;
                }
                if (state === 'SOLICITUD_HORARIO' && nextState === 'SOLICITUD_NOMBRE') {
                    await mergeUserData(userPhone, development, { horario_preferido: messageText.trim() || 'No indicado' });
                }
                await updateState(userPhone, development, nextState);
                logTransition(userPhone, development, state, nextState, messageText, responseKey, 'llm', selection.reasoning);
                if (state === 'SOLICITUD_NOMBRE' && messageText.trim().length >= 3 && nextState === 'CLIENT_ACCEPTA') {
                    await mergeUserData(userPhone, development, { name: messageText.trim() });
                }
                const outboundMessages = buildOutboundFromSelection(
                    development,
                    responseKey,
                    nextState,
                    state === 'SOLICITUD_NOMBRE' ? messageText.trim() : userData?.nombre
                );

                if (responseKey === 'SALIDA_ELEGANTE') {
                    await mergeUserData(userPhone, development, {
                        lead_quality: 'BAJO',
                        disqualified_reason: 'llm_selection',
                    });
                }
                // When LLM moves from FILTRO_INTENCION to CTA_PRIMARIO, persist intencion/perfil_compra so context_preview and Cliq get them
                if (state === 'FILTRO_INTENCION' && nextState === 'CTA_PRIMARIO') {
                    const intencion = responseKey === 'CONFIRMACION_INVERSION' ? 'invertir' : 'comprar';
                    const perfil_compra = responseKey === 'CONFIRMACION_INVERSION' ? 'inversion' : 'construir_casa';
                    await mergeUserData(userPhone, development, { intencion, perfil_compra });
                }
                // When LLM moves from CTA_PRIMARIO to SOLICITUD_HORARIO, persist preferred_action (visita/contactado) y preferred_channel si aplica
                if (state === 'CTA_PRIMARIO' && nextState === 'SOLICITUD_HORARIO') {
                    const ctaPrim = await classifyCtaPrimario(messageText).catch(() => null) ?? matchCtaPrimarioByKeywords(messageText);
                    const channel = await classifyCtaCanal(messageText).catch(() => null) ?? matchCtaCanalByKeywords(messageText);
                    await mergeUserData(userPhone, development, {
                        preferred_action: ctaPrim === 'visitar' ? 'visita' : 'contactado',
                        ...(channel && { preferred_channel: channel }),
                    });
                }
                if (state === 'CTA_CANAL' && (nextState === 'SOLICITUD_HORARIO' || nextState === 'SOLICITUD_NOMBRE')) {
                    const channel = await classifyCtaCanal(messageText).catch(() => null) ?? matchCtaCanalByKeywords(messageText);
                    await mergeUserData(userPhone, development, {
                        preferred_action: 'contactado',
                        preferred_channel: nextState === 'SOLICITUD_NOMBRE' ? 'llamada' : (channel || 'videollamada'),
                    });
                }
                logger.info('Flow driven by LLM response selector', { responseKey, nextState }, 'conversation-flows');
                return { outboundMessages, nextState };
                }
            }
        } catch (err) {
            logger.warn('LLM response selector failed, using keyword/FSM fallback', { err }, 'conversation-flows');
        }
    }

    switch (state) {
        case 'INICIO':
            return await handleFiltroIntencion(messageText, development, userPhone, userData);

        case 'FILTRO_INTENCION':
            return await handleFiltroIntencion(messageText, development, userPhone, userData);

        case 'INFO_REINTENTO':
            return await handleInfoReintento(messageText, development, userPhone, userData);

        case 'CTA_PRIMARIO':
            return await handleCtaPrimario(messageText, development, userPhone);

        case 'CTA_CANAL':
            return await handleCtaCanal(messageText, development, userPhone);

        case 'SOLICITUD_HORARIO':
            return await handleSolicitudHorario(messageText, development, userPhone);

        case 'SOLICITUD_NOMBRE':
            return await handleSolicitudNombre(messageText, development, userPhone, userData, context.phoneNumberId);

        // Legacy redirige a Inicio
        default:
            return await handleInicio(development, userPhone);
    }
}

// =====================================================
// HANDLERS (FSM HUMANIZADA)
// =====================================================

async function handleInicio(development: string, userPhone: string): Promise<FlowResult> {
    await updateState(userPhone, development, 'FILTRO_INTENCION');
    logTransition(userPhone, development, 'INICIO', 'FILTRO_INTENCION', undefined, 'BIENVENIDA', 'system', 'Inicio de conversación - bienvenida enviada');

    const messages = getMessagesForDevelopment(development);

    // Hero image con BIENVENIDA como caption → texto + imagen en un solo mensaje
    const heroImageUrl = getHeroImage(development);
    const outboundMessages: OutboundMessage[] = heroImageUrl
        ? [{ type: 'image', imageUrl: heroImageUrl, caption: messages.BIENVENIDA }]
        : [{ type: 'text', text: messages.BIENVENIDA }];

    return {
        outboundMessages,
        nextState: 'FILTRO_INTENCION'
    };
}

async function handleFiltroIntencion(
    messageText: string,
    development: string,
    userPhone: string,
    userData: UserData
): Promise<FlowResult> {
    const text = messageText.toLowerCase().trim();
    const messages = getMessagesForDevelopment(development);

    // Si solo manda saludo (ej. "Holaaa" tras reset o race), responder con BIENVENIDA como inicio desde cero
    if (isOnlyGreeting(text)) {
        const heroImageUrl = getHeroImage(development);
        const outboundMessages: OutboundMessage[] = heroImageUrl
            ? [{ type: 'image', imageUrl: heroImageUrl, caption: messages.BIENVENIDA }]
            : [{ type: 'text', text: messages.BIENVENIDA }];
        return { outboundMessages, nextState: 'FILTRO_INTENCION' };
    }

    // Primero intentar por palabras clave (más casos de uso, sin depender del LLM)
    let intent = matchIntentByKeywords(messageText);
    if (intent === null) {
        intent = await classifyIntent(messageText);
    }
    // Tratar "mixto" como alta intención (invertir o comprar)
    const isAltaIntencion = intent === 'comprar' || intent === 'invertir' || intent === 'mixto' || text.includes('construir');

    console.log('[WhatsApp] handleFiltroIntencion', { intent, isAltaIntencion, messageLen: messageText.length }, 'messageText=', JSON.stringify(messageText.substring(0, 50)));

    // 1. Invertir / Comprar / Mixto -> ALTA INTENCIÓN
    if (isAltaIntencion) {
        const effectiveIntent = intent === 'invertir' || intent === 'mixto' ? 'invertir' : (intent || 'comprar');
        const perfil_compra = effectiveIntent === 'invertir' ? 'inversion' : 'construir_casa';
        await mergeUserData(userPhone, development, { intencion: effectiveIntent, perfil_compra });
        await updateState(userPhone, development, 'CTA_PRIMARIO');
        logTransition(userPhone, development, 'FILTRO_INTENCION', 'CTA_PRIMARIO', messageText,
            effectiveIntent === 'invertir' ? 'CONFIRMACION_INVERSION' : 'CONFIRMACION_COMPRA',
            'keyword', `Intención detectada por keywords: ${effectiveIntent}`);

        const confirmText = (effectiveIntent === 'invertir') ? messages.CONFIRMACION_INVERSION : messages.CONFIRMACION_COMPRA;
        const cta = messages.CTA_VISITA_O_CONTACTO ?? messages.CTA_AYUDA;
        const combined = `${confirmText}\n\n${cta}`;
        const heroUrl = getHeroImage(development);
        const outboundMessages: OutboundMessage[] = [
            heroUrl
                ? { type: 'image', imageUrl: heroUrl, caption: combined }
                : { type: 'text', text: combined },
        ];

        return {
            outboundMessages,
            nextState: 'CTA_PRIMARIO'
        };
    }

    // 2. Solo Info -> REINTENTO SUAVE
    if (intent === 'solo_info' || text.includes('info') || text.includes('precio') || text.includes('informacion') || text.includes('información') || text.includes('cotiz') || text.includes('cuesta')) {
        if (userData.retry_count && userData.retry_count >= 1) {
            logTransition(userPhone, development, 'FILTRO_INTENCION', 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'fsm', 'Segundo intento de solo_info - salida elegante');
            return await handleSalidaElegante(development, userPhone, 'info_loop');
        }

        await mergeUserData(userPhone, development, { intencion: 'solo_info', retry_count: 1 });
        await updateState(userPhone, development, 'INFO_REINTENTO');
        logTransition(userPhone, development, 'FILTRO_INTENCION', 'INFO_REINTENTO', messageText, 'INFO_REINTENTO', 'keyword', 'Intención solo_info - reintento suave');

        return {
            outboundMessages: [{ type: 'text', text: messages.INFO_REINTENTO }],
            nextState: 'INFO_REINTENTO'
        };
    }

    // 3. No entendió -> Asumimos info primera vez
    if (!userData.retry_count) {
        await mergeUserData(userPhone, development, { retry_count: 1 });
        await updateState(userPhone, development, 'INFO_REINTENTO');
        logTransition(userPhone, development, 'FILTRO_INTENCION', 'INFO_REINTENTO', messageText, 'INFO_REINTENTO', 'fsm', 'Intención no clara - primer reintento');
        return {
            outboundMessages: [{ type: 'text', text: messages.INFO_REINTENTO }],
            nextState: 'INFO_REINTENTO'
        };
    } else {
        logTransition(userPhone, development, 'FILTRO_INTENCION', 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'fsm', 'Intención no clara en segundo intento');
        return await handleSalidaElegante(development, userPhone, 'unclear_intent');
    }
}

async function handleInfoReintento(
    messageText: string,
    development: string,
    userPhone: string,
    _userData: UserData
): Promise<FlowResult> {
    const text = messageText.toLowerCase().trim();
    const messages = getMessagesForDevelopment(development);

    let intent = matchIntentByKeywords(messageText);
    if (intent === null) {
        intent = await classifyIntent(messageText);
    }

    // Recuperado -> Puente a CTA (muchas formas de decir que sí)
    const textNorm = text.replace(/\s+/g, ' ');
    const isAffirmativeIntent = intent === 'comprar' || intent === 'invertir' || intent === 'mixto' ||
        textNorm.includes('si') || textNorm.includes('sí') || textNorm.includes('claro') ||
        textNorm.includes('construir') || textNorm.includes('me interesa') || textNorm.includes('quiero');

    if (isAffirmativeIntent) {
        await mergeUserData(userPhone, development, { intencion: 'recuperado_de_info', perfil_compra: 'inversion' });
        await updateState(userPhone, development, 'CTA_PRIMARIO');
        logTransition(userPhone, development, 'INFO_REINTENTO', 'CTA_PRIMARIO', messageText, 'CONFIRMACION_COMPRA', 'keyword', 'Usuario recuperado tras reintento - intención afirmativa');

        const outboundMessages: OutboundMessage[] = [
            { type: 'text', text: messages.CONFIRMACION_COMPRA },
            { type: 'text', text: messages.CTA_VISITA_O_CONTACTO ?? messages.CTA_AYUDA },
        ];
        // Brochure se envía casi al final (en SOLICITUD_NOMBRE)

        return {
            outboundMessages,
            nextState: 'CTA_PRIMARIO'
        };
    }

    // Si sigue con info/no/duda -> Salida
    logTransition(userPhone, development, 'INFO_REINTENTO', 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'fsm', 'Insiste en solo_info - salida elegante');
    return await handleSalidaElegante(development, userPhone, 'insiste_solo_info');
}

async function handleCtaPrimario(
    messageText: string,
    development: string,
    userPhone: string
): Promise<FlowResult> {
    const messages = getMessagesForDevelopment(development);

    // 1. Negativo -> salida elegante
    if (matchNegativeByKeywords(messageText)) {
        logTransition(userPhone, development, 'CTA_PRIMARIO', 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'keyword', 'Rechazo explícito en CTA primario');
        return await handleSalidaElegante(development, userPhone, 'rechazo_cta_explicito');
    }

    // 2. Visitar -> directo a horario (preferred_action = visita)
    const ctaPrimKeywords = matchCtaPrimarioByKeywords(messageText);
    const ctaPrimLLM = ctaPrimKeywords ?? await classifyCtaPrimario(messageText);
    if (ctaPrimLLM === 'visitar') {
        await mergeUserData(userPhone, development, { preferred_action: 'visita', preferred_channel: undefined });
        await updateState(userPhone, development, 'SOLICITUD_HORARIO');
        logTransition(userPhone, development, 'CTA_PRIMARIO', 'SOLICITUD_HORARIO', messageText, 'SOLICITUD_HORARIO', 'keyword', 'Usuario quiere visitar el desarrollo');
        return {
            outboundMessages: [{ type: 'text', text: messages.SOLICITUD_HORARIO }],
            nextState: 'SOLICITUD_HORARIO',
        };
    }

    // 3. Short-circuit: ya dijo canal (llamada o videollamada) -> saltar CTA_CANAL
    const canalKeywords = matchCtaCanalByKeywords(messageText);
    const canalLLM = canalKeywords ?? await classifyCtaCanal(messageText);
    if (canalLLM === 'llamada') {
        await mergeUserData(userPhone, development, { preferred_action: 'contactado', preferred_channel: 'llamada' });
        await updateState(userPhone, development, 'SOLICITUD_NOMBRE');
        logTransition(userPhone, development, 'CTA_PRIMARIO', 'SOLICITUD_NOMBRE', messageText, 'SOLICITUD_NOMBRE', 'keyword', 'Short-circuit: usuario eligió llamada directamente');
        return {
            outboundMessages: [{ type: 'text', text: messages.SOLICITUD_NOMBRE }],
            nextState: 'SOLICITUD_NOMBRE',
        };
    }
    if (canalLLM === 'videollamada') {
        await mergeUserData(userPhone, development, { preferred_action: 'contactado', preferred_channel: 'videollamada' });
        await updateState(userPhone, development, 'SOLICITUD_HORARIO');
        logTransition(userPhone, development, 'CTA_PRIMARIO', 'SOLICITUD_HORARIO', messageText, 'SOLICITUD_FECHA_HORARIO', 'keyword', 'Short-circuit: usuario eligió videollamada directamente');
        const textHorario = messages.SOLICITUD_FECHA_HORARIO ?? messages.SOLICITUD_HORARIO;
        return {
            outboundMessages: [{ type: 'text', text: textHorario }],
            nextState: 'SOLICITUD_HORARIO',
        };
    }

    // 4. Contactado (genérico, sin canal) -> preguntar canal en CTA_CANAL
    if (ctaPrimLLM === 'contactado' || matchAffirmativeByKeywords(messageText)) {
        await mergeUserData(userPhone, development, { preferred_action: 'contactado' });
        await updateState(userPhone, development, 'CTA_CANAL');
        logTransition(userPhone, development, 'CTA_PRIMARIO', 'CTA_CANAL', messageText, 'CTA_CANAL', 'keyword', 'Usuario quiere ser contactado - preguntando canal');
        const ctaCanalText = messages.CTA_CANAL ?? 'Por llamada telefónica o por videollamada?';
        return {
            outboundMessages: [{ type: 'text', text: ctaCanalText }],
            nextState: 'CTA_CANAL',
        };
    }

    // 5. Ambiguo -> salida elegante
    logTransition(userPhone, development, 'CTA_PRIMARIO', 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'fsm', 'Respuesta ambigua en CTA primario');
    return await handleSalidaElegante(development, userPhone, 'rechazo_cta_ambiguo');
}

async function handleCtaCanal(
    messageText: string,
    development: string,
    userPhone: string
): Promise<FlowResult> {
    const messages = getMessagesForDevelopment(development);

    if (matchNegativeByKeywords(messageText)) {
        logTransition(userPhone, development, 'CTA_CANAL', 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'keyword', 'Rechazo explícito en selección de canal');
        return await handleSalidaElegante(development, userPhone, 'rechazo_cta_explicito');
    }

    const canalKeywords = matchCtaCanalByKeywords(messageText);
    const canal = canalKeywords ?? await classifyCtaCanal(messageText);

    // Llamada telefónica: sin horario, directo a pedir nombre y crear lead
    if (canal === 'llamada') {
        await mergeUserData(userPhone, development, { preferred_action: 'contactado', preferred_channel: 'llamada' });
        await updateState(userPhone, development, 'SOLICITUD_NOMBRE');
        logTransition(userPhone, development, 'CTA_CANAL', 'SOLICITUD_NOMBRE', messageText, 'SOLICITUD_NOMBRE', 'keyword', 'Canal elegido: llamada telefónica');
        return {
            outboundMessages: [{ type: 'text', text: messages.SOLICITUD_NOMBRE }],
            nextState: 'SOLICITUD_NOMBRE',
        };
    }

    // Videollamada: pedir fecha y horario, luego nombre
    if (canal === 'videollamada') {
        await mergeUserData(userPhone, development, { preferred_action: 'contactado', preferred_channel: 'videollamada' });
        await updateState(userPhone, development, 'SOLICITUD_HORARIO');
        logTransition(userPhone, development, 'CTA_CANAL', 'SOLICITUD_HORARIO', messageText, 'SOLICITUD_FECHA_HORARIO', 'keyword', 'Canal elegido: videollamada');
        const textHorario = messages.SOLICITUD_FECHA_HORARIO ?? messages.SOLICITUD_HORARIO;
        return {
            outboundMessages: [{ type: 'text', text: textHorario }],
            nextState: 'SOLICITUD_HORARIO',
        };
    }

    // Afirmativo genérico (ej. "sí") sin canal -> default videollamada (pedir fecha/horario)
    if (matchAffirmativeByKeywords(messageText)) {
        await mergeUserData(userPhone, development, { preferred_action: 'contactado', preferred_channel: 'videollamada' });
        await updateState(userPhone, development, 'SOLICITUD_HORARIO');
        logTransition(userPhone, development, 'CTA_CANAL', 'SOLICITUD_HORARIO', messageText, 'SOLICITUD_FECHA_HORARIO', 'fsm', 'Afirmativo genérico - default videollamada');
        const textHorario = messages.SOLICITUD_FECHA_HORARIO ?? messages.SOLICITUD_HORARIO;
        return {
            outboundMessages: [{ type: 'text', text: textHorario }],
            nextState: 'SOLICITUD_HORARIO',
        };
    }

    logTransition(userPhone, development, 'CTA_CANAL', 'SALIDA_ELEGANTE', messageText, 'SALIDA_ELEGANTE', 'fsm', 'Canal no identificado - salida elegante');
    return await handleSalidaElegante(development, userPhone, 'rechazo_cta_ambiguo');
}

async function handleSolicitudHorario(
    messageText: string,
    development: string,
    userPhone: string
): Promise<FlowResult> {
    const horario = messageText.trim();
    const messages = getMessagesForDevelopment(development);

    // Aceptamos cualquier respuesta como horario preferido (texto libre)
    await mergeUserData(userPhone, development, { horario_preferido: horario || 'No indicado' });
    await updateState(userPhone, development, 'SOLICITUD_NOMBRE');
    logTransition(userPhone, development, 'SOLICITUD_HORARIO', 'SOLICITUD_NOMBRE', messageText, 'SOLICITUD_NOMBRE', 'fsm', 'Horario recibido - solicitando nombre');

    return {
        outboundMessages: [{ type: 'text', text: messages.SOLICITUD_NOMBRE }],
        nextState: 'SOLICITUD_NOMBRE'
    };
}

async function handleSolicitudNombre(
    messageText: string,
    development: string,
    userPhone: string,
    _userData: UserData,
    phoneNumberId?: string
): Promise<FlowResult> {
    const name = messageText.trim();

    // Validación mínima de longitud
    if (name.length < 3) {
        logTransition(userPhone, development, 'SOLICITUD_NOMBRE', 'SOLICITUD_NOMBRE', messageText, 'SOLICITUD_NOMBRE', 'fsm', 'Nombre muy corto - re-solicitando');
        return {
            outboundMessages: [{ type: 'text', text: 'Por favor, ¿me podrías decir tu nombre para decirle al asesor?' }],
            nextState: 'SOLICITUD_NOMBRE'
        };
    }

    // Guardar nombre (userData puede tener horario_preferido ya guardado)
    await mergeUserData(userPhone, development, { name: name });

    // Enviar brochure casi al final, una vez agendada cita/llamada
    const brochureUrl = getBrochure(development);
    const outboundBeforeHandover: OutboundMessage[] = [];
    if (brochureUrl) {
        outboundBeforeHandover.push({
            type: 'document',
            documentUrl: brochureUrl,
            filename: getBrochureFilename(development),
            caption: 'Aquí está la información del desarrollo.',
        });
    }

    // HANDOVER FINAL (CRM + Cliq + markQualified); userData incluye horario_preferido para campo Datos
    const result = await handleClientAccepta(development, userPhone, 'nombre_proporcionado', name, phoneNumberId, _userData);
    result.outboundMessages = [...outboundBeforeHandover, ...result.outboundMessages];
    return result;
}

/** Construye el texto para el campo Datos del lead (horario preferido, contexto personal) */
function buildDatosFromUserData(userData: UserData): string | undefined {
    const parts: string[] = [];
    if (userData.horario_preferido && userData.horario_preferido.trim() && userData.horario_preferido !== 'No indicado') {
        parts.push(`Horario preferido de contacto: ${userData.horario_preferido.trim()}`);
    }
    if (userData.notas_contexto?.trim()) {
        parts.push(`Contexto: ${userData.notas_contexto.trim()}`);
    }
    return parts.length > 0 ? parts.join('. ') : undefined;
}

/** Human-readable label for intencion (inversión / construir / comprar). */
function formatIntencionForCliq(intencion: string | undefined): string {
    if (!intencion) return '';
    const t = String(intencion).toLowerCase();
    if (t === 'invertir') return 'Inversión';
    if (t === 'comprar') return 'Comprar / Construir';
    if (t === 'solo_info') return 'Solo información';
    return intencion;
}

/** Human-readable label for perfil_compra (construir casa vs inversión). */
function formatPerfilCompraForCliq(perfil: string | undefined): string {
    if (!perfil) return '';
    const t = String(perfil).toLowerCase();
    if (t === 'construir_casa' || t.includes('construir')) return 'Construir casa';
    if (t === 'inversion' || t.includes('inver')) return 'Inversión';
    return perfil;
}

/** Intención de compra: solo invertir o comprar/construir (nunca "visita o llamada"). */
function getIntencionForCliq(userData: UserData | undefined): string {
    if (userData?.intencion) return formatIntencionForCliq(userData.intencion);
    if (userData?.perfil_compra) return formatPerfilCompraForCliq(userData.perfil_compra);
    return '';
}

/** Human-readable label for preferred_action + preferred_channel (visita | contactado + llamada/videollamada). */
function formatAccionPreferidaForCliq(userData: UserData | undefined): string {
    const action = (userData?.preferred_action ?? '').toLowerCase();
    const channel = (userData?.preferred_channel ?? '').toLowerCase();
    if (action === 'visita') return 'Visita al desarrollo';
    if (action === 'contactado' && channel === 'llamada') return 'Contacto: Llamada telefónica';
    if (action === 'contactado' && channel === 'videollamada') return 'Contacto: Videollamada';
    if (action === 'contactado') return 'Contacto (canal no indicado)';
    if (action === 'cita' || action.includes('llamada')) return 'Llamada';
    if (action === 'cotizacion' || action.includes('cotiz')) return 'Cotización';
    if (action === 'visita_o_llamada') return 'Visita o llamada';
    if (action) return action;
    return 'Visita o llamada';
}

/** Format phone for display (e.g. +52 1 222 844 2014 for Mexico 12-digit). */
function formatPhoneForDisplay(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length === 0) return phone || '';
    const withPlus = digits.startsWith('52') ? digits : `52${digits}`;
    if (withPlus.length === 12) {
        return `+${withPlus.slice(0, 2)} ${withPlus.slice(2, 3)} ${withPlus.slice(3, 6)} ${withPlus.slice(6, 9)} ${withPlus.slice(9, 12)}`.trim();
    }
    return `+${withPlus}`;
}

/** Format ISO date for "Recibido: 25 Feb 2026 - 09:43". */
function formatReceivedAtForCliq(isoOrDate: string | Date | undefined): string {
    if (!isoOrDate) return '';
    try {
        const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' -');
    } catch {
        return '';
    }
}

/**
 * Builds the handover message to Cliq (formato operativo: cliente, desarrollo, intención, acción, mensaje gatillo, propietario, CRM, ID).
 */
function buildHandoverMessageForCliq(
    userData: UserData | undefined,
    userPhone: string,
    userName: string | undefined,
    crmLeadUrl: string,
    isRetry: boolean,
    assignedAgentEmail?: string | null,
    development?: string,
    triggerTextOverride?: string,
    receivedAtOverride?: string | Date
): string {
    const lines: string[] = [];
    lines.push(isRetry ? 'Lead calificado desde WhatsApp (reintento Cliq).' : 'Lead calificado desde WhatsApp.');
    lines.push('');
    const name = (userName || (userData?.name as string) || userData?.nombre || '').trim();
    lines.push(`Cliente: ${name || '(no indicado)'}`);
    lines.push(`Tel: ${formatPhoneForDisplay(userPhone.replace(/\s/g, ''))}`);
    if (development) lines.push(`Desarrollo: ${development}`);
    const intencion = getIntencionForCliq(userData);
    lines.push(`Intención: ${intencion || '(no indicada)'}`);
    const accion = formatAccionPreferidaForCliq(userData);
    lines.push(`Acción preferida: ${accion}`);
    const horario = (userData?.horario_preferido || '').trim();
    lines.push(`Horario sugerido: ${horario || '(no indicado)'}`);
    if (userData?.notas_contexto) {
        lines.push('');
        lines.push('Contexto del cliente:');
        lines.push(userData.notas_contexto);
    }
    lines.push('');
    const triggerText = (triggerTextOverride ?? (userData as { trigger_text?: string })?.trigger_text ?? '').trim();
    if (triggerText) {
        lines.push('Mensaje del cliente:');
        lines.push(`"${triggerText}"`);
        lines.push('');
    }
    lines.push(`Asignado a: ${assignedAgentEmail && assignedAgentEmail.trim() ? assignedAgentEmail.trim() : '(sin asignar)'}`);
    lines.push('');
    lines.push('CRM:');
    lines.push(crmLeadUrl && crmLeadUrl.trim() ? crmLeadUrl.trim() : '(pendiente)');
    const receivedAt = formatReceivedAtForCliq(receivedAtOverride ?? (userData as { qualified_at?: string })?.qualified_at);
    if (receivedAt) {
        lines.push('');
        lines.push(`Recibido: ${receivedAt}`);
    }
    const conversationId = `wa:${userPhone.replace(/\s/g, '')}|${development || ''}`;
    if (conversationId !== 'wa:|') {
        lines.push('');
        lines.push('Conversación ID:');
        lines.push(conversationId);
    }
    return lines.join('\n');
}

async function handleClientAccepta(
    development: string,
    userPhone: string,
    triggerText: string,
    userName?: string,
    phoneNumberId?: string,
    userData?: UserData,
    skipTransitionLog = false
): Promise<FlowResult> {
    if (!skipTransitionLog) {
        logTransition(userPhone, development, 'SOLICITUD_NOMBRE', 'CLIENT_ACCEPTA', triggerText, 'HANDOVER_EXITOSO', 'fsm', `Nombre recibido: ${userName ? userName.substring(0, 30) : 'no indicado'}`);
    }
    const messages = getMessagesForDevelopment(development);
    const datos = userData ? buildDatosFromUserData(userData) : undefined;

    // 1. Create lead in Zoho CRM (includes GET Lead for Owner/email); campo Datos con horario preferido
    let zoho_lead_id: string | null = null;
    let owner_email: string | null = null;
    try {
        const createResult = await createZohoLeadRecord({
            userPhone,
            development,
            fullName: userName,
            leadSource: 'WhatsApp',
            datos,
        });
        zoho_lead_id = createResult.zoho_lead_id;
        owner_email = createResult.owner_email || null;
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isDuplicate = /duplicate|duplicat/i.test(errMsg);
        if (isDuplicate) {
            const existingLead = await searchZohoLeadsByPhone(userPhone);
            if (existingLead?.id) {
                zoho_lead_id = existingLead.id;
                const fullLead = await getZohoLeadById(existingLead.id);
                const owner = fullLead?.Owner ?? existingLead?.Owner;
                owner_email = (owner as { email?: string })?.email ?? null;
                logger.info('handleClientAccepta: duplicate lead, reusing existing', {
                    zoho_lead_id: existingLead.id,
                    development,
                }, 'conversation-flows');
            }
        }
        if (!zoho_lead_id) {
            logger.error('createZohoLeadRecord failed in handleClientAccepta', err, { userPhone: userPhone.substring(0, 6) + '***', development }, 'conversation-flows');
        }
    }

    // 2. Assigned agent: from Zoho Owner or env CLIQ_AGENT_BY_DEVELOPMENT
    const assigned_agent_email = getAssignedAgentEmail(owner_email, development);

    // 3. Cliq channel + thread when we have phone_number_id and at least one invite email (agent or CLIQ_ALWAYS_INVITE_EMAILS)
    const inviteEmails = buildCliqChannelInviteEmails(assigned_agent_email);
    if (phoneNumberId && inviteEmails.length > 0) {
        try {
            const firstName = userName ? userName.split(' ')[0] : 'Cliente';
            const channelName = buildUniqueCliqChannelName(development, firstName, userPhone);
            const { channel_id, unique_name } = await createCliqChannel({
                name: channelName,
                level: 'organization',
                email_ids: inviteEmails,
            });
            await addBotToCliqChannel(unique_name);
            await upsertWhatsAppCliqThread({
                user_phone: userPhone,
                development,
                phone_number_id: phoneNumberId,
                zoho_lead_id: zoho_lead_id || undefined,
                assigned_agent_email,
                cliq_channel_id: channel_id,
                cliq_channel_unique_name: unique_name,
                status: 'open',
            });
            const crm_lead_url = process.env.ZOHO_CRM_BASE_URL
                ? `${process.env.ZOHO_CRM_BASE_URL.replace(/\/$/, '')}/tab/Leads/${zoho_lead_id}`
                : (zoho_lead_id ? `Lead ID: ${zoho_lead_id}` : '');
            const conv = await getConversation(userPhone, development);
            const dataForCliq = { ...(conv?.user_data || {}), name: userName || (conv?.user_data as { name?: string })?.name, nombre: userName || (conv?.user_data as { nombre?: string })?.nombre };
            const receivedAt = new Date();
            const handoverText = buildHandoverMessageForCliq(
                dataForCliq as UserData,
                userPhone,
                userName,
                crm_lead_url,
                false,
                assigned_agent_email,
                development,
                triggerText,
                receivedAt
            );
            await postMessageToCliqViaWebhook({
                channel_id,
                channel_unique_name: unique_name,
                development,
                user_phone: userPhone,
                user_name: userName || 'Cliente',
                text: handoverText,
                crm_lead_url: typeof crm_lead_url === 'string' && crm_lead_url.startsWith('http') ? crm_lead_url : undefined,
            });
            await markContextSent(userPhone, development);
            await saveBridgeLog({ user_phone: userPhone, development, direction: 'wa_cliq', content: 'Handover enviado al canal Cliq' });
        } catch (cliErr) {
            logger.error('Cliq channel/thread/post failed in handleClientAccepta', cliErr, { development }, 'conversation-flows');
        }
    }

    // 4. Mark qualified and persist
    await markQualified(userPhone, development, zoho_lead_id || 'pending');
    await mergeUserData(userPhone, development, {
        lead_quality: 'ALTO',
        preferred_action: userData?.preferred_action || 'visita',
        preferred_channel: userData?.preferred_channel,
        trigger_text: triggerText,
        qualified_at: new Date().toISOString(),
        ...(assigned_agent_email ? { assigned_owner_email: assigned_agent_email } : {}),
    });
    await updateState(userPhone, development, 'CLIENT_ACCEPTA');

    // 5. Final message to user
    let mensajeFinal = messages.HANDOVER_EXITOSO;
    if (userName) {
        const firstName = userName.split(' ')[0];
        const prettyName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        mensajeFinal = mensajeFinal.replace('{NOMBRE}', prettyName);
    } else {
        mensajeFinal = mensajeFinal.replace(', {NOMBRE}', '');
    }

    return {
        outboundMessages: [{ type: 'text', text: mensajeFinal }],
        nextState: 'CLIENT_ACCEPTA',
        shouldCreateLead: true,
    };
}

/**
 * Reintenta solo la parte Cliq: crea el canal Cliq y el hilo bidireccional WA–Cliq.
 * No crea lead en Zoho; usa el lead existente (conversación o búsqueda por teléfono).
 * Solo aplica a conversaciones en estado CLIENT_ACCEPTA y calificadas.
 */
export async function retryCliqOnly(
    userPhone: string,
    development: string
): Promise<{ success: boolean; zoho_lead_id?: string; error?: string }> {
    const conversation = await getConversation(userPhone, development);
    if (!conversation) {
        return { success: false, error: 'Conversación no encontrada' };
    }
    if (conversation.state !== 'CLIENT_ACCEPTA' || !conversation.is_qualified) {
        return { success: false, error: 'Solo se puede reintentar en conversaciones calificadas (CLIENT_ACCEPTA)' };
    }

    const userName = conversation.user_data?.name || conversation.user_data?.nombre;
    const phoneNumberId = getPhoneNumberIdByDevelopment(development);

    let zoho_lead_id: string | null =
        conversation.zoho_lead_id && conversation.zoho_lead_id !== 'pending'
            ? conversation.zoho_lead_id
            : null;
    if (!zoho_lead_id) {
        const existingLead = await searchZohoLeadsByPhone(userPhone);
        if (existingLead?.id) {
            zoho_lead_id = existingLead.id;
            logger.info('retryCliqOnly: reusing existing lead from search', { zoho_lead_id: existingLead.id, development }, 'conversation-flows');
        }
    }

    let owner_email: string | null = null;
    if (zoho_lead_id) {
        const fullLead = await getZohoLeadById(zoho_lead_id);
        const owner = fullLead?.Owner;
        owner_email = (owner as { email?: string })?.email ?? null;
    }
    const assigned_agent_email = getAssignedAgentEmail(owner_email, development);
    const inviteEmails = buildCliqChannelInviteEmails(assigned_agent_email);
    if (!phoneNumberId) {
        return { success: false, error: 'No hay phone_number_id para este desarrollo' };
    }
    if (inviteEmails.length === 0) {
        return { success: false, error: 'No hay emails válidos para invitar al canal Cliq (revisa CLIQ_ALWAYS_INVITE_EMAILS o asignación del lead)' };
    }
    try {
        const firstName = userName ? String(userName).split(' ')[0] : 'Cliente';
        const channelName = buildUniqueCliqChannelName(development, firstName, userPhone);
        const { channel_id, unique_name } = await createCliqChannel({
            name: channelName,
            level: 'organization',
            email_ids: inviteEmails,
        });
        await addBotToCliqChannel(unique_name);
        await upsertWhatsAppCliqThread({
            user_phone: userPhone,
            development,
            phone_number_id: phoneNumberId,
            zoho_lead_id: zoho_lead_id || undefined,
            assigned_agent_email: assigned_agent_email ?? undefined,
            cliq_channel_id: channel_id,
            cliq_channel_unique_name: unique_name,
            status: 'open',
        });
        const crm_lead_url = process.env.ZOHO_CRM_BASE_URL
            ? `${process.env.ZOHO_CRM_BASE_URL.replace(/\/$/, '')}/tab/Leads/${zoho_lead_id}`
            : (zoho_lead_id ? `Lead ID: ${zoho_lead_id}` : '');
        const handoverText = buildHandoverMessageForCliq(
            conversation.user_data,
            userPhone,
            userName,
            crm_lead_url,
            true,
            assigned_agent_email,
            development
        );
        await postMessageToCliqViaWebhook({
            channel_id,
            channel_unique_name: unique_name,
            development,
            user_phone: userPhone,
            user_name: userName || 'Cliente',
            text: handoverText,
            crm_lead_url: typeof crm_lead_url === 'string' && crm_lead_url.startsWith('http') ? crm_lead_url : undefined,
        });
        await markContextSent(userPhone, development);
        await saveBridgeLog({ user_phone: userPhone, development, direction: 'wa_cliq', content: 'Handover enviado al canal Cliq (reintento)' });
    } catch (cliErr) {
        logger.error('retryCliqOnly: Cliq channel/thread/post failed', cliErr, { development }, 'conversation-flows');
        return { success: false, error: cliErr instanceof Error ? cliErr.message : String(cliErr) };
    }

    await markQualified(userPhone, development, zoho_lead_id ?? undefined);
    logger.info('retryCliqOnly ok', { userPhone: userPhone.substring(0, 6) + '***', development, zoho_lead_id }, 'conversation-flows');
    return { success: true, zoho_lead_id: zoho_lead_id || undefined };
}

/**
 * Reenvia el mensaje de contexto (nombre, intención, horario, etc.) al canal Cliq ya existente.
 * Sirve para debug o cuando el contexto no se envio al crear el canal.
 */
export async function resendCliqContext(
    userPhone: string,
    development: string
): Promise<{ success: boolean; error?: string; debug?: { hasThread: boolean; hasChannel: boolean; user_data_keys: string[] } }> {
    const conversation = await getConversation(userPhone, development);
    if (!conversation) {
        return { success: false, error: 'Conversación no encontrada', debug: { hasThread: false, hasChannel: false, user_data_keys: [] } };
    }
    const thread = await getCliqThreadByUserAndDev(userPhone, development);
    const hasThread = !!thread;
    const hasChannel = !!(thread?.cliq_channel_id && thread?.cliq_channel_unique_name);
    const user_data_keys = conversation.user_data ? Object.keys(conversation.user_data) : [];

    if (!thread?.cliq_channel_id || !thread?.cliq_channel_unique_name) {
        return {
            success: false,
            error: 'No hay canal Cliq vinculado. Usa "Reintentar Cliq" para crear el canal.',
            debug: { hasThread, hasChannel, user_data_keys },
        };
    }

    const userName = conversation.user_data?.name || conversation.user_data?.nombre;
    const crm_lead_url = thread.zoho_lead_id && process.env.ZOHO_CRM_BASE_URL
        ? `${process.env.ZOHO_CRM_BASE_URL.replace(/\/$/, '')}/tab/Leads/${thread.zoho_lead_id}`
        : (thread.zoho_lead_id ? `Lead ID: ${thread.zoho_lead_id}` : '');
    const handoverText = buildHandoverMessageForCliq(
        conversation.user_data as UserData,
        userPhone,
        userName,
        crm_lead_url,
        true,
        thread.assigned_agent_email ?? undefined,
        development
    );

    try {
        await postMessageToCliqViaWebhook({
            channel_id: thread.cliq_channel_id,
            channel_unique_name: thread.cliq_channel_unique_name,
            development,
            user_phone: userPhone,
            user_name: userName || 'Cliente',
            text: handoverText,
            crm_lead_url: crm_lead_url.startsWith('http') ? crm_lead_url : undefined,
        });
        await markContextSent(userPhone, development);
        await saveBridgeLog({ user_phone: userPhone, development, direction: 'wa_cliq', content: 'Contexto reenviado al canal Cliq' });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('resendCliqContext: post failed', err, { development }, 'conversation-flows');
        return { success: false, error: msg, debug: { hasThread, hasChannel, user_data_keys } };
    }

    logger.info('resendCliqContext ok', { userPhone: userPhone.substring(0, 6) + '***', development }, 'conversation-flows');
    return { success: true, debug: { hasThread, hasChannel, user_data_keys } };
}

/**
 * If the channel exists and context was never sent, send it once and mark it.
 * Used by the webhook when bridging WA -> Cliq so the agent gets context on first message.
 */
export async function sendInitialContextIfNeeded(userPhone: string, development: string): Promise<boolean> {
    const thread = await getCliqThreadByUserAndDev(userPhone, development);
    if (!thread?.cliq_channel_id || !thread?.cliq_channel_unique_name || thread.context_sent_at != null) {
        return false;
    }
    const conversation = await getConversation(userPhone, development);
    if (!conversation) return false;
    const userName = conversation.user_data?.name || conversation.user_data?.nombre;
    const crm_lead_url = thread.zoho_lead_id && process.env.ZOHO_CRM_BASE_URL
        ? `${process.env.ZOHO_CRM_BASE_URL.replace(/\/$/, '')}/tab/Leads/${thread.zoho_lead_id}`
        : (thread.zoho_lead_id ? `Lead ID: ${thread.zoho_lead_id}` : '');
    const handoverText = buildHandoverMessageForCliq(
        conversation.user_data as UserData,
        userPhone,
        userName,
        crm_lead_url,
        true,
        thread.assigned_agent_email ?? undefined,
        development
    );
    try {
        await postMessageToCliqViaWebhook({
            channel_id: thread.cliq_channel_id,
            channel_unique_name: thread.cliq_channel_unique_name,
            development,
            user_phone: userPhone,
            user_name: userName || 'Cliente',
            text: handoverText,
            crm_lead_url: crm_lead_url.startsWith('http') ? crm_lead_url : undefined,
        });
        await markContextSent(userPhone, development);
        await saveBridgeLog({ user_phone: userPhone, development, direction: 'wa_cliq', content: 'Contexto inicial enviado al canal Cliq' });
        logger.info('sendInitialContextIfNeeded: context sent once', { userPhone: userPhone.substring(0, 6) + '***', development }, 'conversation-flows');
        return true;
    } catch (err) {
        logger.error('sendInitialContextIfNeeded: post failed', err, { development }, 'conversation-flows');
        return false;
    }
}

/**
 * Reintenta el handover completo: crear/obtener lead en Zoho CRM y luego crear canal Cliq.
 * Si el lead ya existe (duplicate), lo reutiliza y continúa con Cliq.
 * Solo aplica a conversaciones en estado CLIENT_ACCEPTA y calificadas.
 */
export async function retryHandover(
    userPhone: string,
    development: string
): Promise<{ success: boolean; zoho_lead_id?: string; error?: string }> {
    const conversation = await getConversation(userPhone, development);
    if (!conversation) {
        return { success: false, error: 'Conversación no encontrada' };
    }
    if (conversation.state !== 'CLIENT_ACCEPTA' || !conversation.is_qualified) {
        return { success: false, error: 'Solo se puede reintentar en conversaciones calificadas (CLIENT_ACCEPTA)' };
    }

    const userName = conversation.user_data?.name || conversation.user_data?.nombre;
    const userData = conversation.user_data || {};
    const datos = buildDatosFromUserData(userData);
    let zoho_lead_id: string | null = null;

    try {
        const createResult = await createZohoLeadRecord({
            userPhone,
            development,
            fullName: userName,
            leadSource: 'WhatsApp',
            datos,
        });
        zoho_lead_id = createResult.zoho_lead_id;
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isDuplicate = /duplicate|duplicat/i.test(errMsg);
        if (isDuplicate) {
            const existingLead = await searchZohoLeadsByPhone(userPhone);
            if (existingLead?.id) {
                zoho_lead_id = existingLead.id;
                logger.info('retryHandover: duplicate lead, reusing existing', { zoho_lead_id: existingLead.id, development }, 'conversation-flows');
            }
        }
        if (!zoho_lead_id) {
            logger.error('retryHandover: createZohoLeadRecord failed', err, { userPhone: userPhone.substring(0, 6) + '***', development }, 'conversation-flows');
            return { success: false, error: errMsg };
        }
    }

    await markQualified(userPhone, development, zoho_lead_id ?? undefined);
    return retryCliqOnly(userPhone, development);
}

async function handleSalidaElegante(
    development: string,
    userPhone: string,
    reason: string
): Promise<FlowResult> {
    const messages = getMessagesForDevelopment(development);

    await mergeUserData(userPhone, development, {
        lead_quality: 'BAJO',
        disqualified_reason: reason
    });

    await updateState(userPhone, development, 'SALIDA_ELEGANTE');

    return {
        outboundMessages: [{ type: 'text', text: messages.SALIDA_ELEGANTE }],
        nextState: 'SALIDA_ELEGANTE'
    };
}

// Handlers Legacy (redirigen a inicio o devuelven vacío; prefijo _ por no usados)
async function _handleEnvioBrochure(d: string, u: string, _c: unknown) { return handleInicio(d, u); }
async function _handleRevalidacionInteres(m: string, d: string, u: string) { return handleInicio(d, u); }
async function _handleValidacionProducto(d: string, u: string) { return handleInicio(d, u); }
async function _handlePerfilCompra(m: string, d: string, u: string) { return handleInicio(d, u); }
async function _handleCalificacionPresupuesto(m: string, d: string, u: string) { return handleInicio(d, u); }
async function _handleOfertaPlanPagos(m: string, d: string, u: string) { return handleInicio(d, u); }
async function _handleCalificacionUrgencia(m: string, d: string, u: string, _ud: unknown) { return handleInicio(d, u); }
async function _handleSolicitudAccion(m: string, d: string, u: string) { return handleInicio(d, u); }
async function _handleHandoverAsesor(d: string, u: string, _ud: unknown) { return handleInicio(d, u); }
async function _handleConversacionLibre(_m: string, _d: string, _z: string, _ud: unknown) { return { outboundMessages: [] }; }
