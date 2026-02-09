/**
 * =====================================================
 * WHATSAPP CLIENT
 * =====================================================
 * Cliente HTTP para enviar mensajes usando WhatsApp Cloud API
 */

import type { WhatsAppSendMessageResponse, WhatsAppApiError } from './types';
import { logger } from '@/lib/utils/logger';
import { withTimeout, TIMEOUTS } from '@/lib/utils/timeout';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';
const MAX_MESSAGE_LENGTH = 4096; // WhatsApp limita mensajes a 4096 caracteres

// =====================================================
// CLIENT FUNCTIONS
// =====================================================

/**
 * Envía un mensaje de texto por WhatsApp
 * @param phoneNumberId - ID del número de WhatsApp Business
 * @param to - Número de teléfono del destinatario (formato internacional sin +)
 * @param message - Texto del mensaje
 * @returns Response de la API o null si falla
 */
export async function sendTextMessage(
    phoneNumberId: string,
    to: string,
    message: string
): Promise<WhatsAppSendMessageResponse | null> {
    try {
        // Truncar mensaje si excede el límite
        let finalMessage = message;
        if (message.length > MAX_MESSAGE_LENGTH) {
            finalMessage = message.substring(0, MAX_MESSAGE_LENGTH - 20) + '\n\n... (mensaje truncado)';
            logger.warn('Message truncated', {
                originalLength: message.length,
                truncatedLength: finalMessage.length
            }, 'whatsapp-client');
        }

        const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: {
                preview_url: false,
                body: finalMessage,
            },
        };

        logger.debug('Sending WhatsApp message', {
            phoneNumberId,
            to: to.substring(0, 5) + '***', // Ocultar parte del número
            messageLength: finalMessage.length
        }, 'whatsapp-client');

        // Aplicar timeout a la llamada HTTP
        const response = await withTimeout(
            fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            }),
            TIMEOUTS.EXTERNAL_API,
            'Envío de mensaje de WhatsApp excedió el tiempo límite'
        );

        if (!response.ok) {
            const errorData: WhatsAppApiError = await response.json();
            logger.error('WhatsApp API error', undefined, {
                status: response.status,
                error: errorData.error,
            }, 'whatsapp-client');
            return null;
        }

        const data: WhatsAppSendMessageResponse = await response.json();

        logger.debug('WhatsApp message sent successfully', {
            messageId: data.messages?.[0]?.id,
        }, 'whatsapp-client');

        return data;
    } catch (error) {
        logger.error('Error sending WhatsApp message', error, {
            phoneNumberId,
            to: to.substring(0, 5) + '***',
        }, 'whatsapp-client');
        return null;
    }
}

/**
 * Valida el formato de un número de teléfono
 * @param phone - Número de teléfono
 * @returns true si el formato es válido
 */
export function isValidPhoneNumber(phone: string): boolean {
    // Debe ser un número de al menos 10 dígitos
    // Sin el prefijo +, solo números
    const phoneRegex = /^\d{10,15}$/;
    return phoneRegex.test(phone);
}

/**
 * Verifica si el cliente de WhatsApp está configurado correctamente
 * @returns true si tiene el access token configurado
 */
export function isConfigured(): boolean {
    return WHATSAPP_ACCESS_TOKEN.length > 0;
}
