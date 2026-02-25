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
import { createZohoLeadRecord, searchZohoLeadsByPhone, getZohoLeadById } from '@/lib/services/zoho-crm';
import { createCliqChannel, addBotToCliqChannel, postMessageToCliqViaWebhook } from '@/lib/services/zoho-cliq';
import { upsertWhatsAppCliqThread } from '@/lib/db/whatsapp-cliq';
import { getPhoneNumberIdByDevelopment } from './channel-router';

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

    // Si el usuario ya estaba calificado / en handover, no reiniciar flujo; responder breve y mantener estado
    if (conversation.state === 'CLIENT_ACCEPTA' || conversation.is_qualified) {
        const postHandoverReply = 'Ya estás en contacto con un asesor. Cualquier duda puedes escribir aquí.';
        return {
            outboundMessages: [{ type: 'text', text: postHandoverReply }],
            nextState: 'CLIENT_ACCEPTA',
        };
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
        // Brochure se envía casi al final del flujo (en SOLICITUD_NOMBRE)
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
                if (responseKey === 'HANDOVER_EXITOSO' && nextState === 'CLIENT_ACCEPTA') {
                    const userName =
                        state === 'SOLICITUD_NOMBRE' && messageText.trim().length >= 3
                            ? messageText.trim()
                            : userData?.nombre;
                    if (state === 'SOLICITUD_NOMBRE' && userName) {
                        await mergeUserData(userPhone, development, { name: userName });
                    }
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
                        'llm_handover',
                        userName,
                        context.phoneNumberId,
                        userData
                    );
                    handoverResult.outboundMessages = [...brochureMessages, ...handoverResult.outboundMessages];
                    return handoverResult;
                }
                if (state === 'SOLICITUD_HORARIO' && nextState === 'SOLICITUD_NOMBRE') {
                    await mergeUserData(userPhone, development, { horario_preferido: messageText.trim() || 'No indicado' });
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
        // Brochure se envía casi al final, una vez agendada cita/llamada (en SOLICITUD_NOMBRE)
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
            { type: 'text', text: messages.CTA_AYUDA },
        ];
        // Brochure se envía casi al final (en SOLICITUD_NOMBRE)

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
        await updateState(userPhone, development, 'SOLICITUD_HORARIO');
        return {
            outboundMessages: [{ type: 'text', text: messages.SOLICITUD_HORARIO }],
            nextState: 'SOLICITUD_HORARIO'
        };
    } else {
        return await handleSalidaElegante(development, userPhone, 'rechazo_cta_ambiguo');
    }
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

/** Construye el texto para el campo Datos del lead (horario preferido y otras respuestas) */
function buildDatosFromUserData(userData: UserData): string | undefined {
    const parts: string[] = [];
    if (userData.horario_preferido && userData.horario_preferido.trim() && userData.horario_preferido !== 'No indicado') {
        parts.push(`Horario preferido de contacto: ${userData.horario_preferido.trim()}`);
    }
    return parts.length > 0 ? parts.join('. ') : undefined;
}

/** Builds the first message to Cliq with context (user_data) so agents see lead info and preferred action. */
function buildHandoverMessageForCliq(
    userData: UserData | undefined,
    userPhone: string,
    userName: string | undefined,
    crmLeadUrl: string,
    isRetry: boolean
): string {
    const lines: string[] = [];
    lines.push(isRetry ? 'Lead calificado desde WhatsApp (reintento Cliq).' : 'Lead calificado desde WhatsApp.');
    lines.push('Acción preferida: visita/llamada.');
    const name = userName || (userData?.name as string) || userData?.nombre;
    if (name) lines.push(`Nombre: ${String(name).trim()}`);
    if (userData?.intencion) lines.push(`Intención: ${String(userData.intencion)}`);
    if (userData?.horario_preferido) lines.push(`Horario preferido: ${String(userData.horario_preferido).slice(0, 80)}`);
    if (userData?.preferred_action) lines.push(`Acción elegida: ${String(userData.preferred_action)}`);
    if (userData?.lead_quality) lines.push(`Calidad lead: ${userData.lead_quality}`);
    lines.push(`Tel: ${userPhone.replace(/\s/g, '')}`);
    if (crmLeadUrl) lines.push(crmLeadUrl);
    return lines.join('\n');
}

async function handleClientAccepta(
    development: string,
    userPhone: string,
    triggerText: string,
    userName?: string,
    phoneNumberId?: string,
    userData?: UserData
): Promise<FlowResult> {
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

    // 3. Cliq channel + thread only if we have phone_number_id and Cliq is configured
    if (phoneNumberId && assigned_agent_email) {
        try {
            const firstName = userName ? userName.split(' ')[0] : 'Cliente';
            const channelName = buildUniqueCliqChannelName(development, firstName, userPhone);
            const { channel_id, unique_name } = await createCliqChannel({
                name: channelName,
                level: 'organization',
                email_ids: buildCliqChannelInviteEmails(assigned_agent_email),
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
            const handoverText = buildHandoverMessageForCliq(userData, userPhone, userName, crm_lead_url, false);
            await postMessageToCliqViaWebhook({
                channel_id,
                channel_unique_name: unique_name,
                development,
                user_phone: userPhone,
                user_name: userName || 'Cliente',
                text: handoverText,
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
        const handoverText = buildHandoverMessageForCliq(conversation.user_data, userPhone, userName, crm_lead_url, true);
        await postMessageToCliqViaWebhook({
            channel_id,
            channel_unique_name: unique_name,
            development,
            user_phone: userPhone,
            user_name: userName || 'Cliente',
            text: handoverText,
            crm_lead_url: typeof crm_lead_url === 'string' && crm_lead_url.startsWith('http') ? crm_lead_url : undefined,
        });
    } catch (cliErr) {
        logger.error('retryCliqOnly: Cliq channel/thread/post failed', cliErr, { development }, 'conversation-flows');
        return { success: false, error: cliErr instanceof Error ? cliErr.message : String(cliErr) };
    }

    await markQualified(userPhone, development, zoho_lead_id ?? undefined);
    logger.info('retryCliqOnly ok', { userPhone: userPhone.substring(0, 6) + '***', development, zoho_lead_id }, 'conversation-flows');
    return { success: true, zoho_lead_id: zoho_lead_id || undefined };
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
