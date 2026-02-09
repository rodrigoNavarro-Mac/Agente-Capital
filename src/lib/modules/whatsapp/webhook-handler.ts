/**
 * =====================================================
 * WHATSAPP WEBHOOK HANDLER
 * =====================================================
 * Lógica de procesamiento del webhook de WhatsApp
 */

import type {
    WhatsAppWebhookPayload,
    WhatsAppMessage,
    ContextSnapshot
} from './types';
import { logger } from '@/lib/utils/logger';

// =====================================================
// VALIDATION
// =====================================================

/**
 * Valida que el payload del webhook es válido
 * @param payload - Payload del webhook
 * @returns true si es válido
 */
export function isValidWebhookPayload(payload: any): payload is WhatsAppWebhookPayload {
    return (
        payload &&
        typeof payload === 'object' &&
        payload.object === 'whatsapp_business_account' &&
        Array.isArray(payload.entry)
    );
}

/**
 * Verifica si el cambio contiene mensajes de entrada
 * @param change - Cambio del webhook
 * @returns true si contiene mensajes
 */
function hasMessages(change: any): boolean {
    return (
        change?.value?.messages &&
        Array.isArray(change.value.messages) &&
        change.value.messages.length > 0
    );
}

/**
 * Verifica si el mensaje es de tipo texto
 * @param message - Mensaje de WhatsApp
 * @returns true si es mensaje de texto
 */
function isTextMessage(message: WhatsAppMessage): boolean {
    return message.type === 'text' && !!message.text?.body;
}

// =====================================================
// EXTRACTION
// =====================================================

/**
 * Extrae los datos del mensaje del webhook
 * @param payload - Payload del webhook
 * @returns Datos extraídos o null si no hay mensajes válidos
 */
export function extractMessageData(payload: WhatsAppWebhookPayload): {
    phoneNumberId: string;
    userPhone: string;
    message: string;
} | null {
    try {
        // Iterar por las entradas del webhook
        for (const entry of payload.entry) {
            for (const change of entry.changes) {
                // Solo procesar si hay mensajes
                if (!hasMessages(change)) {
                    continue;
                }

                const { metadata, messages } = change.value;
                const phoneNumberId = metadata.phone_number_id;

                // Procesar cada mensaje (normalmente solo hay uno)
                for (const message of messages!) {
                    // Solo procesar mensajes de texto
                    if (!isTextMessage(message)) {
                        logger.debug('Ignoring non-text message', {
                            messageType: message.type,
                            messageId: message.id
                        }, 'whatsapp-handler');
                        continue;
                    }

                    const userPhone = message.from;
                    const messageText = message.text!.body;

                    logger.debug('Message extracted', {
                        phoneNumberId,
                        userPhone: userPhone.substring(0, 5) + '***',
                        messageLength: messageText.length,
                    }, 'whatsapp-handler');

                    return {
                        phoneNumberId,
                        userPhone,
                        message: messageText,
                    };
                }
            }
        }

        // No se encontraron mensajes de texto válidos
        logger.debug('No valid text messages found in webhook', {}, 'whatsapp-handler');
        return null;
    } catch (error) {
        logger.error('Error extracting message data', error, {}, 'whatsapp-handler');
        return null;
    }
}

/**
 * Construye un ContextSnapshot a partir de los datos del mensaje
 * @param phoneNumberId - ID del número de WhatsApp Business
 * @param userPhone - Número de teléfono del usuario
 * @param message - Texto del mensaje
 * @param development - Desarrollo asociado
 * @returns ContextSnapshot para el agente
 */
export function buildContextSnapshot(
    phoneNumberId: string,
    userPhone: string,
    message: string,
    development: string
): ContextSnapshot {
    return {
        channel: 'whatsapp',
        phone_number_id: phoneNumberId,
        user_phone: userPhone,
        message,
        language: 'es-MX',
        development,
    };
}

// =====================================================
// DEDUPLICATION
// =====================================================

// Simple in-memory deduplication cache (MVP)
// En producción, usar Redis o similar
const processedMessageIds = new Set<string>();
const MAX_CACHE_SIZE = 1000;

/**
 * Verifica si un mensaje ya fue procesado (idempotencia básica)
 * @param messageId - ID del mensaje de WhatsApp
 * @returns true si ya fue procesado
 */
export function isMessageProcessed(messageId: string): boolean {
    return processedMessageIds.has(messageId);
}

/**
 * Marca un mensaje como procesado
 * @param messageId - ID del mensaje
 */
export function markMessageAsProcessed(messageId: string): void {
    processedMessageIds.add(messageId);

    // Limpiar caché si crece demasiado
    if (processedMessageIds.size > MAX_CACHE_SIZE) {
        const iterator = processedMessageIds.values();
        const firstItem = iterator.next();
        if (!firstItem.done && firstItem.value) {
            processedMessageIds.delete(firstItem.value);
        }
    }
}
