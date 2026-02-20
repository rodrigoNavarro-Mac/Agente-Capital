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
} from '@/lib/modules/whatsapp/webhook-handler';
import { getRouting } from '@/lib/modules/whatsapp/channel-router';
import { sendTextMessage, sendImageMessage, sendDocumentMessage } from '@/lib/modules/whatsapp/whatsapp-client';
import { handleIncomingMessage } from '@/lib/modules/whatsapp/conversation-flows';
import { logger } from '@/lib/utils/logger';
import { saveWhatsAppLog } from '@/lib/db/postgres';

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

        // 3. Extraer datos del mensaje
        const messageData = extractMessageData(payload);

        if (!messageData) {
            logger.debug('No valid messages to process', undefined, 'whatsapp-webhook');
            return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        const { phoneNumberId, userPhone, message } = messageData;

        // 4. Resolver desarrollo y zona
        const routing = getRouting(phoneNumberId);

        if (!routing) {
            logger.error('Phone number ID not configured', undefined, { phoneNumberId }, 'whatsapp-webhook');
            // Enviar mensaje de error al usuario
            await sendTextMessage(
                phoneNumberId,
                userPhone,
                'Lo siento, este canal no está configurado. Contacta a soporte.'
            );
            return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        const { development, zone } = routing;

        logger.info('Processing WhatsApp message', {
            development,
            zone,
            userPhone: userPhone.substring(0, 5) + '***',
            messageLength: message.length,
        }, 'whatsapp-webhook');

        // 5. Procesar con flujo conversacional
        let messageSent = false;

        try {
            const flowResult = await handleIncomingMessage({
                development,
                zone,
                phoneNumberId,
                userPhone,
                messageText: message,
            });

            // 6. Enviar todos  los mensajes salientes
            logger.debug('Outbound messages to send', {
                count: flowResult.outboundMessages.length,
                types: flowResult.outboundMessages.map(m => m.type),
            }, 'whatsapp-webhook');

            for (const outboundMessage of flowResult.outboundMessages) {
                if (outboundMessage.type === 'image' && outboundMessage.imageUrl) {
                    // Enviar imagen con caption
                    const imageResult = await sendImageMessage(
                        phoneNumberId,
                        userPhone,
                        outboundMessage.imageUrl,
                        outboundMessage.caption
                    );

                    if (!imageResult) {
                        logger.error('Failed to send WhatsApp image', undefined, {
                            phoneNumberId,
                            userPhone: userPhone.substring(0, 5) + '***'
                        }, 'whatsapp-webhook');
                    } else {
                        messageSent = true;
                    }
                } else if (outboundMessage.type === 'text' && outboundMessage.text) {
                    const textResult = await sendTextMessage(
                        phoneNumberId,
                        userPhone,
                        outboundMessage.text
                    );

                    if (!textResult) {
                        logger.error('Failed to send WhatsApp text', undefined, {
                            phoneNumberId,
                            userPhone: userPhone.substring(0, 5) + '***'
                        }, 'whatsapp-webhook');
                    } else {
                        messageSent = true;
                    }
                } else if (outboundMessage.type === 'document' && outboundMessage.documentUrl && outboundMessage.filename) {
                    const docResult = await sendDocumentMessage(
                        phoneNumberId,
                        userPhone,
                        outboundMessage.documentUrl,
                        outboundMessage.filename,
                        outboundMessage.caption
                    );

                    if (!docResult) {
                        logger.error('Failed to send WhatsApp document', undefined, {
                            phoneNumberId,
                            userPhone: userPhone.substring(0, 5) + '***'
                        }, 'whatsapp-webhook');
                    } else {
                        messageSent = true;
                    }
                }
            }

            // 7. Guardar logs (no debe fallar el webhook si la DB falla; los mensajes ya se enviaron)
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
                    });
                } catch (logError) {
                    logger.error('Failed to save WhatsApp log (continuing)', logError, { userPhone: userPhone.substring(0, 5) + '***' }, 'whatsapp-webhook');
                }
            }
        } catch (flowError) {
            logger.error('Error in conversation flow', flowError, { development, zone }, 'whatsapp-webhook');

            // Enviar mensaje de fallback
            const fallbackResult = await sendTextMessage(
                phoneNumberId,
                userPhone,
                'Disculpa, tuve un problema. Por favor intenta de nuevo en un momento.'
            );

            messageSent = !!fallbackResult;
        }

        const processingTime = Date.now() - startTime;
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
