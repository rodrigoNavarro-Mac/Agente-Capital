/**
 * FAQ Router — interceptor de preguntas informativas.
 * Responde sin modificar el estado FSM de la conversación.
 */

import { detectFaqTopic } from './detect-faq-topic';
import { FAQ_BANK } from './faq-bank';
import type { DevelopmentKey, FaqTopic } from './faq-types';
import { getLocationMedia } from '../media-handler';
import { logger } from '@/lib/utils/logger';

const GENERIC_FALLBACK =
    'Te comparto la info que tengo. ¿Qué te interesa: m², amenidades, ubicación, entrega, financiamiento o precios?';

export interface FaqRouterResult {
    handled: boolean;
    response?: string;
    topic?: FaqTopic;
    locationMedia?: { imageUrl?: string; mapsUrl?: string };
}

export async function maybeHandleFaq({
    development,
    messageText,
}: {
    development: string;
    messageText: string;
}): Promise<FaqRouterResult> {
    const topic = detectFaqTopic(messageText);
    if (!topic) {
        return { handled: false };
    }

    const devKey = (development || '').toUpperCase() as DevelopmentKey;
    const bank = FAQ_BANK[devKey];

    const response =
        (bank?.[topic]) ??
        (bank?.['GENERAL']) ??
        GENERIC_FALLBACK;

    logger.info('FAQ router: topic detected', { development, topic }, 'faq-router');

    if (topic === 'UBICACION') {
        const { imageUrl, mapsUrl } = getLocationMedia(development);
        return { handled: true, response, topic, locationMedia: { imageUrl, mapsUrl } };
    }

    return { handled: true, response, topic };
}
