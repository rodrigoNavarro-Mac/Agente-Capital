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
    buildContextSnapshot,
} from '@/lib/modules/whatsapp/webhook-handler';
import { getRouting } from '@/lib/modules/whatsapp/channel-router';
import { sendTextMessage } from '@/lib/modules/whatsapp/whatsapp-client';
import { logger } from '@/lib/utils/logger';
import { queryChunks, buildContextFromMatches } from '@/lib/db/pinecone';
import { runRAGQuery } from '@/lib/services/llm';
import { saveWhatsAppLog } from '@/lib/db/postgres';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const FALLBACK_MESSAGE = 'Lo siento, no tengo suficiente información para responder tu pregunta. Un asesor se pondrá en contacto contigo pronto.';

// =====================================================
// GET - VERIFICACIÓN DEL WEBHOOK
// =====================================================

/**
 * Verifica el webhook de WhatsApp
 * WhatsApp envía: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const mode = searchParams.get('hub.mode');
        const token = searchParams.get('hub.verify_token');
        const challenge = searchParams.get('hub.challenge');

        logger.debug('Webhook verification request', { mode, tokenPresent: !!token }, 'whatsapp-webhook');

        // Verificar que sea una solicitud de suscripción válida
        if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
            logger.info('Webhook verified successfully', undefined, 'whatsapp-webhook');
            return new NextResponse(challenge, { status: 200 });
        }

        logger.warn('Webhook verification failed', { mode, tokenMatch: token === WHATSAPP_VERIFY_TOKEN }, 'whatsapp-webhook');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } catch (error) {
        logger.error('Error in webhook verification', error, undefined, 'whatsapp-webhook');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// =====================================================
// POST - PROCESAMIENTO DE MENSAJES
// =====================================================

/**
 * Procesa mensajes entrantes de WhatsApp
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const startTime = Date.now();

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

        // 5. Procesar con el agente de IA
        let agentResponse: string;

        try {
            // Buscar contexto en Pinecone
            const matches = await queryChunks(zone, { development }, message, 5);

            if (matches.length === 0) {
                logger.warn('No relevant context found in Pinecone', { development, zone }, 'whatsapp-webhook');
                agentResponse = FALLBACK_MESSAGE;
            } else {
                // Construir contexto desde matches
                const ragContext = buildContextFromMatches(matches);

                // Obtener respuesta del LLM
                // Nota: No se pasan memorias en WhatsApp para mantener respuestas cortas
                agentResponse = await runRAGQuery(message, ragContext, undefined, [], matches);

                // Validar que la respuesta no esté vacía
                if (!agentResponse || agentResponse.trim() === '') {
                    logger.warn('Agent returned empty response', undefined, 'whatsapp-webhook');
                    agentResponse = FALLBACK_MESSAGE;
                }
            }
        } catch (agentError) {
            logger.error('Error processing with agent', agentError, { development, zone }, 'whatsapp-webhook');
            agentResponse = FALLBACK_MESSAGE;
        }

        // 7. Enviar respuesta por WhatsApp
        const sendResult = await sendTextMessage(phoneNumberId, userPhone, agentResponse);

        if (!sendResult) {
            logger.error('Failed to send WhatsApp message', undefined, {
                phoneNumberId,
                userPhone: userPhone.substring(0, 5) + '***'
            }, 'whatsapp-webhook');
        }

        // 8. Guardar log en PostgreSQL
        try {
            await saveWhatsAppLog({
                user_phone: userPhone,
                development,
                message,
                response: agentResponse,
                phone_number_id: phoneNumberId,
            });
        } catch (logError) {
            logger.error('Error saving WhatsApp log', logError, undefined, 'whatsapp-webhook');
            // No fallar la request por error de logging
        }

        const processingTime = Date.now() - startTime;
        logger.info('WhatsApp message processed', {
            processingTime,
            development,
            messageSent: !!sendResult
        }, 'whatsapp-webhook');

        // 9. Retornar 200 siempre (WhatsApp requiere)
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
        logger.error('Error in webhook handler', error, undefined, 'whatsapp-webhook');
        // WhatsApp requiere 200 incluso en errores
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
}
