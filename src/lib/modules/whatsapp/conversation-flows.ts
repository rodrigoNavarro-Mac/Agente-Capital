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
import { getMessagesForDevelopment } from './development-content';
import { getHeroImage, getBrochure, getBrochureFilename } from './media-handler';
import { logger } from '@/lib/utils/logger';

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

// Stub para crear lead en Zoho
async function createZohoLead(userPhone: string, development: string, userData: UserData): Promise<string | null> {
    logger.info('Creating Zoho Lead stub', { userPhone, development, userData }, 'zoho-integration');
    return `stub_lead_${Date.now()}`;
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
        // En vez de no responder, enviamos al menos la bienvenida para que el usuario reciba algo.
        if (!conversation) {
            logger.warn('Conversation upsert failed (DB unavailable?). Sending welcome without persisting state.', { userPhone, development }, 'conversation-flows');
            const messages = getMessagesForDevelopment(development);
            return {
                outboundMessages: [{ type: 'text', text: messages.BIENVENIDA }],
            };
        }

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

async function processState(
    state: ConversationState,
    messageText: string,
    context: IncomingMessageContext,
    userData: UserData
): Promise<FlowResult> {
    const { development, userPhone } = context;

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
            return await handleSolicitudNombre(messageText, development, userPhone, userData);

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
    const intent = await classifyIntent(messageText);
    const text = messageText.toLowerCase();
    const messages = getMessagesForDevelopment(development);

    // 1. Invertir / Comprar -> ALTA INTENCIÓN
    if (intent === 'comprar' || intent === 'invertir' || text.includes('construir')) {
        await mergeUserData(userPhone, development, { intencion: intent || 'comprar' });
        await updateState(userPhone, development, 'CTA_PRIMARIO');

        const outboundMessages: OutboundMessage[] = [
            {
                type: 'text',
                text: (intent === 'invertir') ? messages.CONFIRMACION_INVERSION : messages.CONFIRMACION_COMPRA
            },
        ];

        // Opcional: enviar PDF brochure del desarrollo si está configurado
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
    if (intent === 'solo_info' || text.includes('info') || text.includes('precio')) {
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
    const intent = await classifyIntent(messageText);
    const text = messageText.toLowerCase();
    const messages = getMessagesForDevelopment(development);

    // Recuperado -> Puente a CTA
    if (intent === 'comprar' || intent === 'invertir' || text.includes('si') || text.includes('construir')) {
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
    const text = messageText.toLowerCase();

    // DETECCIÓN DE NEGATIVOS (PRIORIDAD ALTA)
    // Si contiene "no" seguido de palabras clave negativas O frases completas
    const isNegative =
        text.includes('no puedo') ||
        text.includes('no gracias') ||
        text.includes('no quiero') ||
        text.includes('no me interesa') ||
        text.includes('no tengo tiempo') || // CASO CRÍTICO
        text.includes('ahora no') ||
        text.includes('luego') ||
        text.includes('ocupado') ||
        text.includes('despues') ||
        (text.startsWith('no') && text.length < 5);

    if (isNegative) {
        return await handleSalidaElegante(development, userPhone, 'rechazo_cta_explicito');
    }

    // CRITERIO ESTRICTO DE ACEPTACIÓN
    const isAffirmative =
        text.includes('si') ||
        text.includes('claro') ||
        text.includes('agendar') ||
        text.includes('visita') ||
        text.includes('llama') ||
        text.includes('ok') ||
        text.includes('va') ||
        text.includes('bueno') ||
        (action !== null); // Solo si acción es clara

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
    _userData: UserData
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

    // HANDOVER FINAL
    return await handleClientAccepta(development, userPhone, 'nombre_proporcionado', name);
}

async function handleClientAccepta(
    development: string,
    userPhone: string,
    triggerText: string,
    userName?: string
): Promise<FlowResult> {
    const messages = getMessagesForDevelopment(development);

    // 1. Crear Lead
    const zohoId = await createZohoLead(userPhone, development, { preferred_action: 'visita', name: userName });

    // 2. Marcar Calificado
    await markQualified(userPhone, development, zohoId || 'pending');

    // 3. Guardar datos
    await mergeUserData(userPhone, development, {
        lead_quality: 'ALTO',
        preferred_action: 'visita_o_llamada',
        trigger_text: triggerText,
        qualified_at: new Date().toISOString()
    });

    // 4. Finalizar
    await updateState(userPhone, development, 'CLIENT_ACCEPTA');

    // Personalizar mensaje con nombre (según desarrollo)
    let mensajeFinal = messages.HANDOVER_EXITOSO;
    if (userName) {
        // Extraer primer nombre
        const firstName = userName.split(' ')[0];
        // Capitalizar primera letra
        const prettyName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        mensajeFinal = mensajeFinal.replace('{NOMBRE}', prettyName);
    } else {
        mensajeFinal = mensajeFinal.replace(', {NOMBRE}', '');
    }

    return {
        outboundMessages: [{ type: 'text', text: mensajeFinal }],
        nextState: 'CLIENT_ACCEPTA',
        shouldCreateLead: true
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
