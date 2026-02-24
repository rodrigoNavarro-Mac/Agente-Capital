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
    classifyAccion,
} from './intent-classifier';
import { matchIntentByKeywords, matchAffirmativeByKeywords, matchNegativeByKeywords } from './conversation-keywords';
import { getMessagesForDevelopment } from './development-content';
import { getHeroImage, getBrochure, getBrochureFilename } from './media-handler';
import { selectResponseAndState, getResponseText, type ResponseKey } from './response-selector';
import { logger } from '@/lib/utils/logger';
import { createZohoLeadRecord } from '@/lib/services/zoho-crm';
import { createCliqChannel, postMessageToCliqViaWebhook } from '@/lib/services/zoho-cliq';
import { upsertWhatsAppCliqThread } from '@/lib/db/whatsapp-cliq';

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
// CONFIGURACIÓN HORARIA
// =====================================================

function isBusinessHours(): boolean {
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

// =====================================================
// FLUJO PRINCIPAL
// =====================================================

export async function handleIncomingMessage(
    context: IncomingMessageContext
): Promise<FlowResult> {
    const { development, zone: _zone, userPhone, messageText } = context;

    // 1. DESARROLLO: Detectar comando /reset
    if (messageText.trim().toLowerCase() === '/reset') {
        await resetConversation(userPhone, development);
        return {
            outboundMessages: [{ type: 'text', text: '🔄 Conversación reiniciada (Modo Humanizado + Nombre).' }]
        };
    }

    // 2. Obtener conversación
    let conversation = await getConversation(userPhone, development);

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
        const firstMessageIntent = matchIntentByKeywords(messageText);
        const firstIntent = firstMessageIntent ?? await classifyIntent(messageText);
        const firstIsAlta = firstIntent === 'comprar' || firstIntent === 'invertir' || firstIntent === 'mixto';
        if (firstIsAlta || firstIntent === 'solo_info') {
            await updateState(userPhone, development, 'FILTRO_INTENCION');
            return await processState('FILTRO_INTENCION', messageText, context, conversation.user_data || {});
        }

        logger.info('New conversation created', { userPhone: userPhone.substring(0, 5) + '***', development }, 'conversation-flows');
        return await handleInicio(development, userPhone);
    }

    // Si el usuario ya estaba en handover pero escribe de nuevo, re-entrar al flujo (bienvenida)
    if (conversation.state === 'CLIENT_ACCEPTA' || conversation.is_qualified) {
        await updateState(userPhone, development, 'INICIO');
        return await handleInicio(development, userPhone);
    }

    if (conversation.state === 'SALIDA_ELEGANTE') {
        await updateState(userPhone, development, 'INICIO');
        return await handleInicio(development, userPhone);
    }

    return await processState(conversation.state, messageText, context, conversation.user_data);
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
    outbound.push({ type: 'text', text });

    if (responseKey === 'BIENVENIDA') {
        const heroUrl = getHeroImage(development);
        if (heroUrl) outbound.push({ type: 'image', imageUrl: heroUrl, caption: undefined });
    }

    if (responseKey === 'CONFIRMACION_COMPRA' || responseKey === 'CONFIRMACION_INVERSION') {
        const brochureUrl = getBrochure(development);
        if (brochureUrl) {
            outbound.push({
                type: 'document',
                documentUrl: brochureUrl,
                filename: getBrochureFilename(development),
                caption: 'Aquí está la información del desarrollo.',
            });
        }
        outbound.push({ type: 'text', text: messages.CTA_AYUDA });
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

    logger.info('Processing state', { state, development, userPhone: userPhone.substring(0, 5) + '***' }, 'conversation-flows');

    // Opción: usar LLM para elegir respuesta del banco y siguiente estado (con contexto de mensajes si se agrega después)
    const useLLMSelector = ['FILTRO_INTENCION', 'INFO_REINTENTO', 'CTA_PRIMARIO', 'SOLICITUD_NOMBRE'].includes(state);
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
                if (responseKey === 'HANDOVER_EXITOSO' && nextState === 'CLIENT_ACCEPTA') {
                    const userName =
                        state === 'SOLICITUD_NOMBRE' && messageText.trim().length >= 3
                            ? messageText.trim()
                            : userData?.nombre;
                    if (state === 'SOLICITUD_NOMBRE' && userName) {
                        await mergeUserData(userPhone, development, { name: userName });
                    }
                    return await handleClientAccepta(
                        development,
                        userPhone,
                        'llm_handover',
                        userName,
                        context.phoneNumberId
                    );
                }
                await updateState(userPhone, development, nextState);
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
                logger.info('Flow driven by LLM response selector', { responseKey, nextState }, 'conversation-flows');
                return { outboundMessages, nextState };
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

    const messages = getMessagesForDevelopment(development);
    const outboundMessages: OutboundMessage[] = [{ type: 'text', text: messages.BIENVENIDA }];

    // Si el desarrollo tiene imagen hero, enviarla después de la bienvenida
    const heroImageUrl = getHeroImage(development);
    if (heroImageUrl) {
        outboundMessages.push({
            type: 'image',
            imageUrl: heroImageUrl,
            caption: undefined,
        });
    }

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
        await mergeUserData(userPhone, development, { intencion: effectiveIntent });
        await updateState(userPhone, development, 'CTA_PRIMARIO');

        const outboundMessages: OutboundMessage[] = [
            {
                type: 'text',
                text: (effectiveIntent === 'invertir') ? messages.CONFIRMACION_INVERSION : messages.CONFIRMACION_COMPRA
            },
        ];

        const brochureUrl = getBrochure(development);
        if (brochureUrl) {
            outboundMessages.push({
                type: 'document',
                documentUrl: brochureUrl,
                filename: getBrochureFilename(development),
                caption: 'Aquí está la información del desarrollo.',
            });
        }

        outboundMessages.push({ type: 'text', text: messages.CTA_AYUDA });

        return {
            outboundMessages,
            nextState: 'CTA_PRIMARIO'
        };
    }

    // 2. Solo Info -> REINTENTO SUAVE
    if (intent === 'solo_info' || text.includes('info') || text.includes('precio') || text.includes('informacion') || text.includes('información') || text.includes('cotiz') || text.includes('cuesta')) {
        if (userData.retry_count && userData.retry_count >= 1) {
            return await handleSalidaElegante(development, userPhone, 'info_loop');
        }

        await mergeUserData(userPhone, development, { intencion: 'solo_info', retry_count: 1 });
        await updateState(userPhone, development, 'INFO_REINTENTO');

        return {
            outboundMessages: [{ type: 'text', text: messages.INFO_REINTENTO }],
            nextState: 'INFO_REINTENTO'
        };
    }

    // 3. No entendió -> Asumimos info primera vez
    if (!userData.retry_count) {
        await mergeUserData(userPhone, development, { retry_count: 1 });
        await updateState(userPhone, development, 'INFO_REINTENTO');
        return {
            outboundMessages: [{ type: 'text', text: messages.INFO_REINTENTO }],
            nextState: 'INFO_REINTENTO'
        };
    } else {
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
        await mergeUserData(userPhone, development, { intencion: 'recuperado_de_info' });
        await updateState(userPhone, development, 'CTA_PRIMARIO');

        const outboundMessages: OutboundMessage[] = [
            { type: 'text', text: messages.CONFIRMACION_COMPRA },
        ];
        const brochureUrl = getBrochure(development);
        if (brochureUrl) {
            outboundMessages.push({
                type: 'document',
                documentUrl: brochureUrl,
                filename: getBrochureFilename(development),
                caption: 'Aquí está la información del desarrollo.',
            });
        }
        outboundMessages.push({ type: 'text', text: messages.CTA_AYUDA });

        return {
            outboundMessages,
            nextState: 'CTA_PRIMARIO'
        };
    }

    // Si sigue con info/no/duda -> Salida
    return await handleSalidaElegante(development, userPhone, 'insiste_solo_info');
}

async function handleCtaPrimario(
    messageText: string,
    development: string,
    userPhone: string
): Promise<FlowResult> {
    const action = await classifyAccion(messageText);

    // Negativos: primero por palabras clave ampliadas, luego reglas concretas
    const isNegative = matchNegativeByKeywords(messageText);

    if (isNegative) {
        return await handleSalidaElegante(development, userPhone, 'rechazo_cta_explicito');
    }

    // Afirmativo: keywords ampliados o LLM (cita/visita/cotizacion)
    const isAffirmative = matchAffirmativeByKeywords(messageText) || (action !== null);

    const messages = getMessagesForDevelopment(development);
    if (isAffirmative) {
        await updateState(userPhone, development, 'SOLICITUD_NOMBRE');
        return {
            outboundMessages: [{ type: 'text', text: messages.SOLICITUD_NOMBRE }],
            nextState: 'SOLICITUD_NOMBRE'
        };
    } else {
        return await handleSalidaElegante(development, userPhone, 'rechazo_cta_ambiguo');
    }
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
        return {
            outboundMessages: [{ type: 'text', text: 'Por favor, ¿me podrías decir tu nombre para decirle al asesor?' }],
            nextState: 'SOLICITUD_NOMBRE'
        };
    }

    // Guardar nombre
    await mergeUserData(userPhone, development, { name: name });

    // HANDOVER FINAL (CRM + Cliq + markQualified)
    return await handleClientAccepta(development, userPhone, 'nombre_proporcionado', name, phoneNumberId);
}

async function handleClientAccepta(
    development: string,
    userPhone: string,
    triggerText: string,
    userName?: string,
    phoneNumberId?: string
): Promise<FlowResult> {
    const messages = getMessagesForDevelopment(development);

    // 1. Create lead in Zoho CRM (includes GET Lead for Owner/email)
    let zoho_lead_id: string | null = null;
    let owner_email: string | null = null;
    try {
        const createResult = await createZohoLeadRecord({
            userPhone,
            development,
            fullName: userName,
            leadSource: 'WhatsApp',
        });
        zoho_lead_id = createResult.zoho_lead_id;
        owner_email = createResult.owner_email || null;
    } catch (err) {
        logger.error('createZohoLeadRecord failed in handleClientAccepta', err, { userPhone: userPhone.substring(0, 6) + '***', development }, 'conversation-flows');
    }

    // 2. Assigned agent: from Zoho Owner or env CLIQ_AGENT_BY_DEVELOPMENT
    const assigned_agent_email = getAssignedAgentEmail(owner_email, development);

    // 3. Cliq channel + thread only if we have phone_number_id and Cliq is configured
    if (phoneNumberId && assigned_agent_email) {
        try {
            const firstName = userName ? userName.split(' ')[0] : 'Cliente';
            const channelName = `WA | ${development} | ${firstName} | ${userPhone.replace(/\s/g, '')}`;
            const { channel_id, unique_name } = await createCliqChannel({
                name: channelName,
                level: 'organization',
                email_ids: [assigned_agent_email],
            });
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
            await postMessageToCliqViaWebhook({
                channel_id,
                channel_unique_name: unique_name,
                development,
                user_phone: userPhone,
                user_name: userName || 'Cliente',
                text: `Lead calificado desde WhatsApp. Acción preferida: visita/llamada.${crm_lead_url ? ` ${crm_lead_url}` : ''}`,
                crm_lead_url: typeof crm_lead_url === 'string' && crm_lead_url.startsWith('http') ? crm_lead_url : undefined,
            });
        } catch (cliErr) {
            logger.error('Cliq channel/thread/post failed in handleClientAccepta', cliErr, { development }, 'conversation-flows');
        }
    }

    // 4. Mark qualified and persist
    await markQualified(userPhone, development, zoho_lead_id || 'pending');
    await mergeUserData(userPhone, development, {
        lead_quality: 'ALTO',
        preferred_action: 'visita_o_llamada',
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
