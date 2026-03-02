/**
 * =====================================================
 * WHATSAPP WEBHOOK ENDPOINT
 * =====================================================
 * Endpoint para recibir y procesar webhooks de WhatsApp Cloud API
 * 
 * GET: Verificación del webhook
 * POST: Procesamiento de mensajes entrantes
 */

import { NextRequest, NextResponse } from 'next/server';
import type { WhatsAppWebhookPayload } from '@/lib/modules/whatsapp/types';
import {
    isValidWebhookPayload,
    extractMessageData,
    extractMessageDataIncludingMedia,
    extractStatusUpdates,
} from '@/lib/modules/whatsapp/webhook-handler';
import { getRouting } from '@/lib/modules/whatsapp/channel-router';
import { sendTextMessage, sendImageMessage, sendDocumentMessage } from '@/lib/modules/whatsapp/whatsapp-client';
import { handleIncomingMessage, sendInitialContextIfNeeded } from '@/lib/modules/whatsapp/conversation-flows';
import { getConversation } from '@/lib/modules/whatsapp/conversation-state';
import { logger } from '@/lib/utils/logger';
import { saveWhatsAppLog, updateWhatsAppLogSeenByOutboundMessageId } from '@/lib/db/postgres';
import { getCliqThreadByUserAndDev } from '@/lib/db/whatsapp-cliq';
import { postMessageToCliqViaWebhook } from '@/lib/services/zoho-cliq';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const _FALLBACK_MESSAGE = 'Lo siento, no tengo suficiente información para responder tu pregunta. Un asesor se pondrá en contacto contigo pronto.';

// =====================================================
// GET - VERIFICACIÓN DEL WEBHOOK
// =====================================================

/**
 * Verifica el webhook de WhatsApp
 * WhatsApp envía: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    // Log inmediato para confirmar que Meta llega a la URL (verificación del webhook)
    console.log('[WhatsApp Webhook] GET received - verification');
    try {
        const searchParams = request.nextUrl.searchParams;
        const mode = searchParams.get('hub.mode');
        const token = searchParams.get('hub.verify_token');
        const challenge = searchParams.get('hub.challenge');

        // Debug logging
        console.log("VERIFY DEBUG", {
            received: token,
            env: process.env.WHATSAPP_VERIFY_TOKEN,
            mode,
            challenge,
        });

        logger.debug('Webhook verification request', { mode, tokenPresent: !!token }, 'whatsapp-webhook');

        // Verificar que sea una solicitud de suscripción válida
        if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
            logger.info('Webhook verified successfully', {}, 'whatsapp-webhook');
            // Retornar el challenge directamente como texto plano
            return new NextResponse(challenge, { status: 200 });
        }

        logger.warn('Webhook verification failed', { mode, tokenMatch: token === WHATSAPP_VERIFY_TOKEN }, 'whatsapp-webhook');
        return new NextResponse('Forbidden', { status: 403 });
    } catch (error) {
        logger.error('Error in webhook verification', error, {}, 'whatsapp-webhook');
        return new NextResponse('Internal server error', { status: 500 });
    }
}

// =====================================================
// POST - PROCESAMIENTO DE MENSAJES
// =====================================================

/**
 * Procesa mensajes entrantes de WhatsApp
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    // Log inmediato para confirmar que Meta envía mensajes a esta URL
    const hasToken = !!(process.env.WHATSAPP_ACCESS_TOKEN ?? '').trim();
    console.log('[WhatsApp Webhook] POST received - incoming message', { hasToken });
    const startTime = Date.now();

    if (!hasToken) {
        logger.error('WHATSAPP_ACCESS_TOKEN is missing or empty in this environment. Replies will not be sent.', undefined, {}, 'whatsapp-webhook');
    }

    try {
        // 1. Parsear payload
        const payload: WhatsAppWebhookPayload = await request.json();

        logger.debug('Webhook received', { object: payload.object }, 'whatsapp-webhook');

        // 2. Validar payload
        if (!isValidWebhookPayload(payload)) {
            logger.warn('Invalid webhook payload', { payload }, 'whatsapp-webhook');
            // WhatsApp requiere que devolvamos 200 incluso si ignoramos el evento
            return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        // 2b. Procesar actualizaciones de estado (sent, delivered, read) para métricas
        const statusUpdates = extractStatusUpdates(payload);
        for (const st of statusUpdates) {
            if (st.status === 'read') {
                const seenAt = new Date(parseInt(st.timestamp, 10) * 1000);
                await updateWhatsAppLogSeenByOutboundMessageId(st.messageId, seenAt);
            }
        }

        // 3. Extraer datos del mensaje (texto, botón o interactivo)
        const messageData = extractMessageData(payload);

        // Si no hay texto procesable pero sí hay mensaje (media/sticker), extraer para puente WA -> Cliq
        // y enviar placeholder en Cliq (ej. "[Se adjuntó foto]") para que el asesor sepa que el cliente envió algo.
        if (!messageData) {
            const bridgeData = extractMessageDataIncludingMedia(payload);
            if (bridgeData) {
                const routing = getRouting(bridgeData.phoneNumberId);
                if (routing) {
                    const thread = await getCliqThreadByUserAndDev(bridgeData.userPhone, routing.development);
                    if (thread?.cliq_channel_id && thread?.cliq_channel_unique_name) {
                        const conversation = await getConversation(bridgeData.userPhone, routing.development);
                        const user_name = (conversation?.user_data as { name?: string } | undefined)?.name || 'Cliente';
                        const crm_lead_url = thread.zoho_lead_id && process.env.ZOHO_CRM_BASE_URL
                            ? `${process.env.ZOHO_CRM_BASE_URL.replace(/\/$/, '')}/tab/Leads/${thread.zoho_lead_id}`
                            : undefined;
                        await postMessageToCliqViaWebhook({
                            channel_id: thread.cliq_channel_id,
                            channel_unique_name: thread.cliq_channel_unique_name,
                            conversation_id: `wa:${bridgeData.userPhone}|${routing.development}`,
                            wa_message_id: bridgeData.messageId,
                            development: routing.development,
                            user_phone: bridgeData.userPhone,
                            user_name,
                            text: bridgeData.message,
                            crm_lead_url,
                        });
                        logger.info('WA->Cliq bridge (media placeholder)', {
                            development: routing.development,
                            placeholder: bridgeData.message,
                        }, 'whatsapp-webhook');
                    }
                }
            }
            return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        const { phoneNumberId, userPhone, message, messageId: incomingMessageId, messageTimestamp } = messageData;
        const ts = parseInt(messageTimestamp, 10);
        const receivedAt = Number.isFinite(ts) ? new Date(ts * 1000) : new Date();
        console.log('[WhatsApp Webhook] messageData ok', { phoneNumberId, userPhonePrefix: userPhone.substring(0, 6) + '***', messageLen: message.length });

        // 4. Resolver desarrollo y zona
        const routing = getRouting(phoneNumberId);

        if (!routing) {
            console.log('[WhatsApp Webhook] routing null for phoneNumberId', phoneNumberId);
            logger.error('Phone number ID not configured', undefined, { phoneNumberId }, 'whatsapp-webhook');
            // Enviar mensaje de error al usuario
            await sendTextMessage(
                phoneNumberId,
                userPhone,
                'Lo siento, este canal no está configurado. Contacta a soporte.',
                incomingMessageId
            );
            return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        const { development, zone } = routing;

        // Diagnóstico: estado guardado en DB (si siempre es null, falta migración 037)
        const conversationBefore = await getConversation(userPhone, development);
        const stateLabel = conversationBefore?.state ?? 'NEW (sin fila en whatsapp_conversations)';
        console.log('[WhatsApp Webhook] conversation state=', stateLabel, '| Si siempre NEW, ejecuta migracion 037 en Supabase');

        logger.info('Processing WhatsApp message', {
            development,
            zone,
            userPhone: userPhone.substring(0, 5) + '***',
            messageLength: message.length,
        }, 'whatsapp-webhook');

        // 5. Procesar con flujo conversacional (estado se persiste en whatsapp_conversations; requiere migración 037)
        let messageSent = false;
        let firstOutboundMessageId: string | undefined;

        try {
            const flowResult = await handleIncomingMessage({
                development,
                zone,
                phoneNumberId,
                userPhone,
                messageText: message,
            });

            console.log('[WhatsApp Webhook] flowResult', {
                outboundCount: flowResult.outboundMessages.length,
                nextState: flowResult.nextState,
                firstType: flowResult.outboundMessages[0]?.type,
            });

            if (flowResult.outboundMessages.length === 0) {
                console.log('[WhatsApp Webhook] No outbound messages to send (flow returned empty)');
            }

            // 6. Enviar todos los mensajes salientes y capturar el ID del primero (para métricas)
            logger.debug('Outbound messages to send', {
                count: flowResult.outboundMessages.length,
                types: flowResult.outboundMessages.map(m => m.type),
            }, 'whatsapp-webhook');

            for (const outboundMessage of flowResult.outboundMessages) {
                if (outboundMessage.type === 'image' && outboundMessage.imageUrl) {
                    const imageResult = await sendImageMessage(
                        phoneNumberId,
                        userPhone,
                        outboundMessage.imageUrl,
                        outboundMessage.caption,
                        incomingMessageId
                    );

                    if (!imageResult) {
                        logger.error('Failed to send WhatsApp image', undefined, {
                            phoneNumberId,
                            userPhone: userPhone.substring(0, 5) + '***'
                        }, 'whatsapp-webhook');
                    } else {
                        messageSent = true;
                        if (!firstOutboundMessageId && imageResult.messages?.[0]?.id) {
                            firstOutboundMessageId = imageResult.messages[0].id;
                        }
                    }
                } else if (outboundMessage.type === 'text' && outboundMessage.text) {
                    const textResult = await sendTextMessage(
                        phoneNumberId,
                        userPhone,
                        outboundMessage.text,
                        incomingMessageId
                    );

                    if (!textResult) {
                        logger.error('Failed to send WhatsApp text', undefined, {
                            phoneNumberId,
                            userPhone: userPhone.substring(0, 5) + '***'
                        }, 'whatsapp-webhook');
                    } else {
                        messageSent = true;
                        if (!firstOutboundMessageId && textResult.messages?.[0]?.id) {
                            firstOutboundMessageId = textResult.messages[0].id;
                        }
                    }
                } else if (outboundMessage.type === 'document' && outboundMessage.documentUrl && outboundMessage.filename) {
                    const docResult = await sendDocumentMessage(
                        phoneNumberId,
                        userPhone,
                        outboundMessage.documentUrl,
                        outboundMessage.filename,
                        outboundMessage.caption,
                        incomingMessageId
                    );

                    if (!docResult) {
                        logger.error('Failed to send WhatsApp document', undefined, {
                            phoneNumberId,
                            userPhone: userPhone.substring(0, 5) + '***'
                        }, 'whatsapp-webhook');
                    } else {
                        messageSent = true;
                        if (!firstOutboundMessageId && docResult.messages?.[0]?.id) {
                            firstOutboundMessageId = docResult.messages[0].id;
                        }
                    }
                }
            }

            // Si el flujo no devolvio mensajes: en handover (CLIENT_ACCEPTA) no enviamos nada; en otros casos fallback.
            if (flowResult.outboundMessages.length === 0 && !messageSent && flowResult.nextState !== 'CLIENT_ACCEPTA') {
                const fallbackSent = await sendTextMessage(
                    phoneNumberId,
                    userPhone,
                    'Escribe algo para comenzar o /reset para reiniciar la conversación.',
                    incomingMessageId
                );
                messageSent = !!fallbackSent;
            }

            const responseAt = new Date();

            // 7. Guardar logs con métricas de desempeño (received_at, response_at, seen_at, message ids)
            if (flowResult.outboundMessages.length > 0) {
                const firstMessage = flowResult.outboundMessages[0];
                const responseText = firstMessage.type === 'text'
                    ? firstMessage.text || ''
                    : firstMessage.type === 'document'
                        ? (firstMessage.caption || '[documento enviado]')
                        : (firstMessage.caption || '[imagen enviada]');

                try {
                    await saveWhatsAppLog({
                        user_phone: userPhone,
                        development,
                        message,
                        response: responseText,
                        phone_number_id: phoneNumberId,
                        received_at: receivedAt,
                        response_at: responseAt,
                        incoming_message_id: incomingMessageId,
                        outbound_message_id: firstOutboundMessageId,
                    });
                } catch (logError) {
                    logger.error('Failed to save WhatsApp log (continuing)', logError, { userPhone: userPhone.substring(0, 5) + '***' }, 'whatsapp-webhook');
                }
            }
        } catch (flowError) {
            console.log('[WhatsApp Webhook] flowError', flowError instanceof Error ? flowError.message : String(flowError));
            logger.error('Error in conversation flow', flowError, { development, zone }, 'whatsapp-webhook');

            // Enviar mensaje de fallback
            const fallbackResult = await sendTextMessage(
                phoneNumberId,
                userPhone,
                'Disculpa, tuve un problema. Por favor intenta de nuevo en un momento.',
                incomingMessageId
            );

            messageSent = !!fallbackResult;
        }

        // WA -> Cliq: only when thread exists (lead already qualified), not during FSM
        try {
            const thread = await getCliqThreadByUserAndDev(userPhone, development);
            if (thread?.cliq_channel_id && thread?.cliq_channel_unique_name) {
                // If channel exists but context was never sent, send it once (then mark so we do not repeat)
                await sendInitialContextIfNeeded(userPhone, development);
                const conversation = await getConversation(userPhone, development);
                const user_name = (conversation?.user_data as { name?: string } | undefined)?.name || 'Cliente';
                const crm_lead_url = thread.zoho_lead_id && process.env.ZOHO_CRM_BASE_URL
                    ? `${process.env.ZOHO_CRM_BASE_URL.replace(/\/$/, '')}/tab/Leads/${thread.zoho_lead_id}`
                    : undefined;
                await postMessageToCliqViaWebhook({
                    channel_id: thread.cliq_channel_id,
                    channel_unique_name: thread.cliq_channel_unique_name,
                    conversation_id: `wa:${userPhone}|${development}`,
                    wa_message_id: incomingMessageId,
                    development,
                    user_phone: userPhone,
                    user_name,
                    text: message,
                    crm_lead_url,
                });
            }
        } catch (cliBridgeErr) {
            logger.error('WA->Cliq bridge failed (continuing)', cliBridgeErr, { userPhone: userPhone.substring(0, 6) + '***', development }, 'whatsapp-webhook');
        }

        const processingTime = Date.now() - startTime;
        console.log('[WhatsApp Webhook] done', { processingTime, messageSent });
        logger.info('WhatsApp message processed', {
            processingTime,
            development,
            messageSent
        }, 'whatsapp-webhook');

        // 9. Retornar 200 siempre (WhatsApp requiere)
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
        logger.error('Error in webhook handler', error, undefined, 'whatsapp-webhook');
        // WhatsApp requiere 200 incluso en errores
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
}
