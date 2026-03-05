/**
 * =====================================================
 * WHATSAPP CHANNEL ROUTER
 * =====================================================
 * Mapea phone_number_id → development
 * Configuración aislada y fácilmente actualizable
 */

import type { ChannelConfig, RoutingResult } from './types';
import { logger } from '@/lib/utils/logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

/**
 * Mapeo de phone_number_id a desarrollo (multi-desarrollo).
 * Cada número de WhatsApp Business tiene su propio desarrollo; los mensajes,
 * imagen hero y brochure se eligen según este desarrollo (development-content + media-handler).
 * Agregar aquí nuevos pares phone_number_id -> desarrollo cuando actives más números.
 */
const CHANNEL_CONFIG: ChannelConfig = {
    // FUEGO: número de prueba - WABA ID: 2047862732669355
    '980541871814181': 'FUEGO',
    // Ejemplos para cuando tengas los números de AMURA y PUNTO_TIERRA:
    '913257945213997': 'AMURA',
    '1049033564953396': 'PUNTO_TIERRA',
};

/**
 * Mapeo de desarrollo a zona
 * Necesario para las consultas al agente
 */
const DEVELOPMENT_TO_ZONE: Record<string, string> = {
    'FUEGO': 'quintana_roo',
    'AMURA': 'yucatan',
    'PUNTO_TIERRA': 'yucatan',
};

// =====================================================
// ROUTING FUNCTIONS
// =====================================================

/**
 * Obtiene el desarrollo asociado a un phone_number_id
 * @param phoneNumberId - ID del número de teléfono de WhatsApp Business
 * @returns Nombre del desarrollo o null si no está configurado
 */
export function getDevelopment(phoneNumberId: string): string | null {
    const development = CHANNEL_CONFIG[phoneNumberId];

    if (!development) {
        logger.warn('Phone number ID not found in channel router', { phoneNumberId }, 'whatsapp-router');
        return null;
    }

    logger.debug('Development resolved', { phoneNumberId, development }, 'whatsapp-router');
    return development;
}

/**
 * Obtiene el desarrollo y zona para routing completo
 * @param phoneNumberId - ID del número de teléfono
 * @returns Objeto con development y zone, o null si no está configurado
 */
export function getRouting(phoneNumberId: string): RoutingResult | null {
    const development = getDevelopment(phoneNumberId);

    if (!development) {
        return null;
    }

    const zone = DEVELOPMENT_TO_ZONE[development];

    if (!zone) {
        logger.error('Development not mapped to zone', new Error('Zone mapping not found'), { development }, 'whatsapp-router');
        return null;
    }

    return { development, zone };
}

/**
 * Verifica si un phone_number_id está configurado
 * @param phoneNumberId - ID del número de teléfono
 * @returns true si está configurado
 */
export function isConfigured(phoneNumberId: string): boolean {
    return phoneNumberId in CHANNEL_CONFIG;
}

/**
 * Obtiene todos los phone_number_ids configurados
 * @returns Array de phone_number_ids
 */
export function getConfiguredPhoneNumbers(): string[] {
    return Object.keys(CHANNEL_CONFIG);
}

/**
 * Obtiene el primer phone_number_id asociado a un desarrollo (fallback cuando el thread no tiene phone_number_id)
 * @param development - Nombre del desarrollo
 * @returns phone_number_id o null si no hay mapeo
 */
export function getPhoneNumberIdByDevelopment(development: string): string | null {
    const norm = (development || '').trim();
    if (!norm) return null;
    const entry = Object.entries(CHANNEL_CONFIG).find(([, dev]) => (dev || '').trim() === norm);
    return entry ? entry[0] : null;
}
