/**
 * =====================================================
 * ZOHO CLIQ OUTGOING WEBHOOK -> WHATSAPP
 * =====================================================
 * Recibe mensajes del asesor desde Cliq (Channel Outgoing Webhook o
 * Bot Participation Handler que invoque esta URL). Solo reenvía a WA
 * los mensajes de usuarios; ignora mensajes del bot para evitar bucles.
 * Validación: X-Bridge-Token o query/body secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCliqThreadByChannelId, getCliqThreadByChannelUniqueName, markCliqWaSent, setCliqWaError, setCliqChatIdForThread, setCliqRawPayloadForThread } from '@/lib/db/whatsapp-cliq';
import { saveBridgeLog } from '@/lib/db/postgres';
import { touchLastInteraction } from '@/lib/modules/whatsapp/conversation-state';
import { getPhoneNumberIdByDevelopment } from '@/lib/modules/whatsapp/channel-router';
import { sendDocumentMessage, sendImageMessage, sendTextMessage } from '@/lib/modules/whatsapp/whatsapp-client';
import { getAmenitiesImages, getBrochure, getBrochureFilename, getLocationMedia } from '@/lib/modules/whatsapp/media-handler';
import { logger } from '@/lib/utils/logger';

const CLIQ_BRIDGE_SECRET = (process.env.CLIQ_BRIDGE_SECRET || '').trim();
const CLIQ_BOT_UNIQUE_NAME = (process.env.CLIQ_BOT_UNIQUE_NAME || '').trim().toLowerCase();

function getSecretFromRequest(request: NextRequest, body: Record<string, unknown>): string | null {
    const header = request.headers.get('X-Bridge-Token');
    if (header) return header.trim();
    const q = request.nextUrl.searchParams.get('secret');
    if (q) return q.trim();
    const b = body.secret;
    if (typeof b === 'string') return b.trim();
    return null;
}

/** Extract channel id from flat or nested payload (Channel Webhook or Participation Handler). */
function getChannelId(body: Record<string, unknown>): string {
    const c = body.channel_id;
    if (typeof c === 'string') return c.trim();
    if (typeof c === 'number') return String(c);
    const chat = body.chat as Record<string, unknown> | undefined;
    if (chat) {
        const id = chat.id;
        if (typeof id === 'string') return id.trim();
        if (typeof id === 'number') return String(id);
    }
    return '';
}

/** Extract message text from flat or nested payload. */
function getMessageText(body: Record<string, unknown>): string {
    if (typeof body.message === 'string') return body.message.trim();
    if (typeof body.text === 'string') return body.text.trim();
    const data = body.data as Record<string, unknown> | undefined;
    if (data?.message) {
        const msg = data.message as Record<string, unknown>;
        if (typeof msg.text === 'string') return msg.text.trim();
    }
    return '';
}

/**
 * Returns true if the sender is the bot (do not forward to WA).
 * Sender can be string (id or name) or object { id, name, type }.
 */
function isSenderBot(sender: unknown): boolean {
    if (sender == null) return false;
    if (typeof sender === 'string') {
        const s = sender.trim().toLowerCase();
        if (CLIQ_BOT_UNIQUE_NAME && s === CLIQ_BOT_UNIQUE_NAME) return true;
        if (s.startsWith('b-')) return true;
        if (/bot|wabot|wa\|bot/i.test(s)) return true;
        return false;
    }
    if (typeof sender === 'object' && sender !== null) {
        const o = sender as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id.trim().toLowerCase() : '';
        const type = typeof o.type === 'string' ? o.type.trim().toLowerCase() : '';
        const name = typeof o.name === 'string' ? o.name.trim().toLowerCase() : '';
        if (type === 'bot') return true;
        if (id.startsWith('b-')) return true;
        if (CLIQ_BOT_UNIQUE_NAME && (id === CLIQ_BOT_UNIQUE_NAME || name === CLIQ_BOT_UNIQUE_NAME)) return true;
        if (/bot|wabot|wa\|bot/.test(name) || /bot|wabot|wa\|bot/.test(id)) return true;
    }
    return false;
}

/** Get sender from body (flat body.sender or body.user for Participation Handler). */
function getSender(body: Record<string, unknown>): unknown {
    if (body.sender !== undefined) return body.sender;
    return body.user;
}

/** Extract channel unique name for fallback lookup (Cliq sends CT_... as id but we store O...; unique_name matches). */
function getChannelUniqueName(body: Record<string, unknown>): string {
    const u = body.channel_unique_name;
    if (typeof u === 'string') return u.trim();
    const chat = body.chat as Record<string, unknown> | undefined;
    if (chat) {
        const a = chat.channel_unique_name ?? chat.unique_name ?? chat.name ?? chat.title;
        if (typeof a === 'string') return a.trim();
    }
    return '';
}

/**
 * Parsea un posible comando de Cliq en formato "/comando arg1 arg2".
 * Si el texto no comienza con "/", devuelve null.
 */
function parseCliqCommand(message: string): { command: string; args: string[] } | null {
    const trimmed = (message || '').trim();
    if (!trimmed.startsWith('/')) {
        return null;
    }
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    return { command, args };
}

/**
 * Envía amenidades por WhatsApp a partir del contexto del thread (desarrollo + usuario).
 * No reenvía el texto del comando al cliente; solo las imágenes configuradas.
 */
async function handleAmenitiesCommandForThread(
    development: string,
    userPhone: string,
    phoneNumberId: string
): Promise<boolean> {
    const to = userPhone.replace(/^\+/, '');
    const amenitiesImages = getAmenitiesImages(development);

    if (amenitiesImages.length === 0) {
        // Si no hay amenidades configuradas, no fallar: simplemente no se envía media.
        await sendTextMessage(
            phoneNumberId,
            to,
            'Aún no hay amenidades configuradas para este desarrollo. Un asesor te compartirá más información en breve.'
        );
        return false;
    }

    let anySent = false;
    for (const url of amenitiesImages) {
        const result = await sendImageMessage(
            phoneNumberId,
            to,
            url,
            undefined
        );
        if (result) {
            anySent = true;
        }
    }
    return anySent;
}

/**
 * Envía la información de ubicación por WhatsApp a partir del contexto del thread.
 * Combina imagen (si existe) y texto (dirección + link de mapa).
 */
async function handleLocationCommandForThread(
    development: string,
    userPhone: string,
    phoneNumberId: string
): Promise<boolean> {
    const to = userPhone.replace(/^\+/, '');
    const locationMedia = getLocationMedia(development);

    let anySent = false;

    if (locationMedia.imageUrl) {
        const caption = locationMedia.locationText || `Ubicación del desarrollo ${development}`;
        const imageResult = await sendImageMessage(
            phoneNumberId,
            to,
            locationMedia.imageUrl,
            caption
        );
        if (imageResult) {
            anySent = true;
        }
    }

    const parts: string[] = [];
    if (locationMedia.locationText) {
        parts.push(locationMedia.locationText);
    }
    if (locationMedia.mapsUrl) {
        parts.push(locationMedia.mapsUrl);
    }
    const text = parts.join('\n');

    if (text.trim().length > 0) {
        const textResult = await sendTextMessage(
            phoneNumberId,
            to,
            text
        );
        if (textResult) {
            anySent = true;
        }
    }

    if (!anySent) {
        await sendTextMessage(
            phoneNumberId,
            to,
            'Aún no hay información de ubicación configurada para este desarrollo. Un asesor te compartirá los detalles en breve.'
        );
    }

    return anySent;
}

/**
 * Envía el brochure PDF del desarrollo actual por WhatsApp.
 */
async function handleBrochureCommandForThread(
    development: string,
    userPhone: string,
    phoneNumberId: string
): Promise<boolean> {
    const to = userPhone.replace(/^\+/, '');
    const brochureUrl = getBrochure(development);

    if (!brochureUrl) {
        await sendTextMessage(
            phoneNumberId,
            to,
            'Aún no hay brochure configurado para este desarrollo. Un asesor te compartirá la información en breve.'
        );
        return false;
    }

    const filename = getBrochureFilename(development);
    const result = await sendDocumentMessage(
        phoneNumberId,
        to,
        brochureUrl,
        filename,
        'Te comparto el brochure del desarrollo.'
    );

    if (!result) {
        await sendTextMessage(
            phoneNumberId,
            to,
            'Hubo un problema al enviar el brochure. Por favor intenta de nuevo o avisa a soporte.'
        );
        return false;
    }

    return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    let body: Record<string, unknown> = {};
    try {
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const secret = getSecretFromRequest(request, body);
        if (CLIQ_BRIDGE_SECRET) {
            if (secret !== CLIQ_BRIDGE_SECRET) {
                logger.warn('Cliq webhook: invalid or missing secret', {}, 'webhooks-cliq');
                return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 200 });
            }
        } else {
            logger.warn('Cliq webhook: CLIQ_BRIDGE_SECRET not set, accepting all requests (solo para pruebas)', {}, 'webhooks-cliq');
        }

        const channel_id = getChannelId(body);
        const message = getMessageText(body);
        const sender = getSender(body);

        if (!channel_id) {
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        if (!message) {
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        // Anti-loop: ignore messages that contain [WA-IN] (our own formatted posts)
        if (message.includes('[WA-IN]')) {
            return NextResponse.json({ ok: true, skipped: 'wa-in' }, { status: 200 });
        }

        // Only forward messages from humans; ignore bot messages
        if (isSenderBot(sender)) {
            logger.debug('Cliq webhook: skipped bot sender', { channel_id }, 'webhooks-cliq');
            return NextResponse.json({ ok: true, skipped: 'bot' }, { status: 200 });
        }

        let thread = await getCliqThreadByChannelId(channel_id);
        if (!thread) {
            const channel_unique_name = getChannelUniqueName(body);
            if (channel_unique_name) {
                thread = await getCliqThreadByChannelUniqueName(channel_unique_name);
            }
        }
        if (!thread) {
            logger.warn('Cliq webhook: no thread for channel (revisa whatsapp_cliq_threads.cliq_channel_id o envia channel_unique_name)', { channel_id }, 'webhooks-cliq');
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        // Guardar último payload bruto de Cliq para este thread (debug).
        try {
            await setCliqRawPayloadForThread(thread.user_phone, thread.development, body);
        } catch {
            // no bloquear flujo por debug
        }

        // Si canal_id es un CT_... (ID de chat real), persistirlo en el thread para poder construir URLs correctas.
        if (channel_id && typeof channel_id === 'string' && channel_id.startsWith('CT_')) {
            try {
                await setCliqChatIdForThread(thread.user_phone, thread.development, channel_id);
            } catch {
                // no bloquear el flujo por errores de debug
            }
        }

        const phone_number_id = thread.phone_number_id || getPhoneNumberIdByDevelopment(thread.development);
        if (!phone_number_id) {
            logger.warn('Cliq webhook: no phone_number_id for thread', { channel_id, development: thread.development }, 'webhooks-cliq');
            await setCliqWaError(channel_id, 'no phone_number_id');
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        // Resolver comando (si aplica) usando el contexto del thread (desarrollo + lead).
        const parsedCommand = parseCliqCommand(message);
        if (parsedCommand) {
            const { command } = parsedCommand;
            let handled = false;

            if (command === '/amenidades') {
                handled = await handleAmenitiesCommandForThread(
                    thread.development,
                    thread.user_phone,
                    phone_number_id
                );
            } else if (command === '/ubicacion') {
                handled = await handleLocationCommandForThread(
                    thread.development,
                    thread.user_phone,
                    phone_number_id
                );
            } else if (command === '/brochure') {
                handled = await handleBrochureCommandForThread(
                    thread.development,
                    thread.user_phone,
                    phone_number_id
                );
            }

            if (handled) {
                await markCliqWaSent(thread.user_phone, thread.development);
                await touchLastInteraction(thread.user_phone, thread.development);
                await saveBridgeLog({
                    user_phone: thread.user_phone,
                    development: thread.development,
                    direction: 'cliqq_wa',
                    content: message,
                });
                logger.info('Cliq->WA command handled', { channel_id, command, development: thread.development }, 'webhooks-cliq');
                return NextResponse.json({ ok: true, handled: true, command }, { status: 200 });
            }
            // Si el comando no fue reconocido o no se pudo manejar, se continúa y se reenvía como texto normal.
        }

        const to = thread.user_phone.replace(/^\+/, '');
        await sendTextMessage(phone_number_id, to, message, undefined);
        await markCliqWaSent(thread.user_phone, thread.development);
        await touchLastInteraction(thread.user_phone, thread.development);
        await saveBridgeLog({
            user_phone: thread.user_phone,
            development: thread.development,
            direction: 'cliqq_wa',
            content: message,
        });
        logger.info('Cliq->WA sent', { channel_id, to: to.substring(0, 6) + '***' }, 'webhooks-cliq');
        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
        logger.error('Cliq webhook error', error, {}, 'webhooks-cliq');
        try {
            const cid = getChannelId(body);
            if (cid) await setCliqWaError(cid, error instanceof Error ? error.message : String(error));
        } catch {
            // ignore
        }
        return NextResponse.json({ ok: true }, { status: 200 });
    }
}
