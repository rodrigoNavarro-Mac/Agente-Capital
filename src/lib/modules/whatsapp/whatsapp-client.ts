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
 * @param contextMessageId - Opcional. WAMID del mensaje al que se responde (respuesta contextual)
 * @returns Response de la API o null si falla
 */
export async function sendTextMessage(
    phoneNumberId: string,
    to: string,
    message: string,
    contextMessageId?: string
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

        const body: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: {
                preview_url: false,
                body: finalMessage,
            },
        };
        if (contextMessageId) {
            body.context = { message_id: contextMessageId };
        }

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
            const bodyText = await response.text();
            let errorData: WhatsAppApiError | null = null;
            try {
                errorData = bodyText ? (JSON.parse(bodyText) as WhatsAppApiError) : null;
            } catch {
                logger.error('WhatsApp API error (body not JSON)', undefined, {
                    status: response.status,
                    bodyPreview: bodyText?.slice(0, 200),
                }, 'whatsapp-client');
                return null;
            }
            logger.error('WhatsApp API error', undefined, {
                status: response.status,
                error: errorData?.error ?? bodyText,
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
 * Envía una imagen con caption opcional por WhatsApp
 * @param phoneNumberId - ID del número de WhatsApp Business
 * @param to - Número de teléfono del destinatario (formato internacional sin +)
 * @param imageUrl - URL pública de la imagen
 * @param caption - Texto opcional que acompaña la imagen
 * @param contextMessageId - Opcional. WAMID del mensaje al que se responde (respuesta contextual)
 * @returns Response de la API o null si falla
 */
export async function sendImageMessage(
    phoneNumberId: string,
    to: string,
    imageUrl: string,
    caption?: string,
    contextMessageId?: string
): Promise<WhatsAppSendMessageResponse | null> {
    try {
        const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

        const body: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'image',
            image: {
                link: imageUrl,
                ...(caption && { caption }),
            },
        };
        if (contextMessageId) {
            body.context = { message_id: contextMessageId };
        }

        logger.debug('Sending WhatsApp image', {
            phoneNumberId,
            to: to.substring(0, 5) + '***',
            imageUrl: imageUrl.substring(0, 50) + '...',
            hasCaption: !!caption
        }, 'whatsapp-client');

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
            'Envío de imagen de WhatsApp excedió el tiempo límite'
        );

        if (!response.ok) {
            const errorData: WhatsAppApiError = await response.json();
            logger.error('WhatsApp API error sending image', undefined, {
                status: response.status,
                error: errorData.error,
            }, 'whatsapp-client');
            return null;
        }

        const data: WhatsAppSendMessageResponse = await response.json();

        logger.debug('WhatsApp image sent successfully', {
            messageId: data.messages?.[0]?.id,
        }, 'whatsapp-client');

        return data;
    } catch (error) {
        logger.error('Error sending WhatsApp image', error, {
            phoneNumberId,
            to: to.substring(0, 5) + '***',
        }, 'whatsapp-client');
        return null;
    }
}

/**
 * Envía un documento/PDF por WhatsApp
 * @param phoneNumberId - ID del número de WhatsApp Business
 * @param to - Número de teléfono del destinatario (formato internacional sin +)
 * @param documentUrl - URL pública del documento
 * @param filename - Nombre del archivo (con extensión)
 * @param caption - Texto opcional que acompaña el documento
 * @param contextMessageId - Opcional. WAMID del mensaje al que se responde (respuesta contextual)
 * @returns Response de la API o null si falla
 */
export async function sendDocumentMessage(
    phoneNumberId: string,
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string,
    contextMessageId?: string
): Promise<WhatsAppSendMessageResponse | null> {
    try {
        const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

        const body: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'document',
            document: {
                link: documentUrl,
                filename,
                ...(caption && { caption }),
            },
        };
        if (contextMessageId) {
            body.context = { message_id: contextMessageId };
        }

        logger.debug('Sending WhatsApp document', {
            phoneNumberId,
            to: to.substring(0, 5) + '***',
            filename,
            hasCaption: !!caption
        }, 'whatsapp-client');

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
            'Envío de documento de WhatsApp excedió el tiempo límite'
        );

        if (!response.ok) {
            const errorData: WhatsAppApiError = await response.json();
            logger.error('WhatsApp API error sending document', undefined, {
                status: response.status,
                error: errorData.error,
            }, 'whatsapp-client');
            return null;
        }

        const data: WhatsAppSendMessageResponse = await response.json();

        logger.debug('WhatsApp document sent successfully', {
            messageId: data.messages?.[0]?.id,
        }, 'whatsapp-client');

        return data;
    } catch (error) {
        logger.error('Error sending WhatsApp document', error, {
            phoneNumberId,
            to: to.substring(0, 5) + '***',
        }, 'whatsapp-client');
        return null;
    }
}

// =====================================================
// TEMPLATE & PHONE VALIDATION
// =====================================================

interface WhatsAppContactsResponse {
    contacts: Array<{
        input: string;
        status: string;
        wa_id?: string;
    }>;
}

export interface WhatsAppPhoneValidationResult {
    valid: boolean;
    wa_id?: string;
}

/**
 * Verifica si un número de teléfono está registrado en WhatsApp usando la Contacts API.
 * @param phoneNumberId - ID del número de WhatsApp Business emisor
 * @param phone - Número de teléfono del destinatario (formato internacional sin +)
 */
/**
 * Normaliza un número de teléfono a formato internacional mexicano.
 * - 10 dígitos → agrega prefijo 52 (México)
 * - 12 dígitos iniciando con 521 → quita el 1 intermedio (521XXXXXXXXXX → 52XXXXXXXXXX)
 * - Ya tiene + → lo quita para consistencia interna
 */
export function normalizePhoneToInternational(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `52${digits}`;
    if (digits.length === 13 && digits.startsWith('521')) return `52${digits.slice(3)}`;
    return digits;
}

export async function validateWhatsAppPhone(
    phoneNumberId: string,
    phone: string
): Promise<WhatsAppPhoneValidationResult> {
    try {
        const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/contacts`;
        const normalized = normalizePhoneToInternational(phone);
        const phoneWithPlus = `+${normalized}`;

        const response = await withTimeout(
            fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    blocking: 'wait',
                    contacts: [phoneWithPlus],
                    force_check: false,
                }),
            }),
            TIMEOUTS.EXTERNAL_API,
            'WhatsApp phone validation exceeded timeout'
        );

        if (!response.ok) {
            logger.warn('WhatsApp phone validation request failed', { status: response.status }, 'whatsapp-client');
            return { valid: false };
        }

        const data: WhatsAppContactsResponse = await response.json();
        const contact = data.contacts?.[0];
        const valid = contact?.status === 'valid' && !!contact?.wa_id;
        return { valid, wa_id: contact?.wa_id };
    } catch (error) {
        logger.error('Error validating WhatsApp phone', error, {}, 'whatsapp-client');
        return { valid: false };
    }
}

/**
 * Envía un mensaje de plantilla (template) por WhatsApp Cloud API.
 * @param phoneNumberId - ID del número de WhatsApp Business emisor
 * @param to - Número de teléfono del destinatario (formato internacional sin +)
 * @param templateName - Nombre de la plantilla registrada en WhatsApp Business Manager
 * @param languageCode - Código de idioma BCP 47 (ej. 'es_MX', 'es')
 */
export async function sendTemplateMessage(
    phoneNumberId: string,
    to: string,
    templateName: string,
    languageCode: string
): Promise<WhatsAppSendMessageResponse | null> {
    try {
        const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

        const body = {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode },
            },
        };

        logger.debug('Sending WhatsApp template message', {
            phoneNumberId,
            to: to.substring(0, 5) + '***',
            templateName,
        }, 'whatsapp-client');

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
            'WhatsApp template send exceeded timeout'
        );

        if (!response.ok) {
            const bodyText = await response.text();
            let errorData: WhatsAppApiError | null = null;
            try {
                errorData = bodyText ? (JSON.parse(bodyText) as WhatsAppApiError) : null;
            } catch {
                logger.error('WhatsApp template API error (body not JSON)', undefined, {
                    status: response.status,
                    bodyPreview: bodyText?.slice(0, 200),
                }, 'whatsapp-client');
                return null;
            }
            logger.error('WhatsApp template API error', undefined, {
                status: response.status,
                error: errorData?.error ?? bodyText,
            }, 'whatsapp-client');
            return null;
        }

        const data: WhatsAppSendMessageResponse = await response.json();
        logger.debug('WhatsApp template sent successfully', { messageId: data.messages?.[0]?.id }, 'whatsapp-client');
        return data;
    } catch (error) {
        logger.error('Error sending WhatsApp template', error, {
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
