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
import { getCliqThreadByChannelId } from '@/lib/db/whatsapp-cliq';
import { getPhoneNumberIdByDevelopment } from '@/lib/modules/whatsapp/channel-router';
import { sendTextMessage } from '@/lib/modules/whatsapp/whatsapp-client';
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
    if (typeof body.channel_id === 'string') return body.channel_id.trim();
    const chat = body.chat as Record<string, unknown> | undefined;
    if (chat && typeof chat.id === 'string') return chat.id.trim();
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

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        let body: Record<string, unknown> = {};
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

        const thread = await getCliqThreadByChannelId(channel_id);
        if (!thread) {
            logger.debug('Cliq webhook: no thread for channel', { channel_id }, 'webhooks-cliq');
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        const phone_number_id = thread.phone_number_id || getPhoneNumberIdByDevelopment(thread.development);
        if (!phone_number_id) {
            logger.warn('Cliq webhook: no phone_number_id for thread', { channel_id, development: thread.development }, 'webhooks-cliq');
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        const to = thread.user_phone.replace(/^\+/, '');
        await sendTextMessage(phone_number_id, to, message, undefined);
        logger.info('Cliq->WA sent', { channel_id, to: to.substring(0, 6) + '***' }, 'webhooks-cliq');
        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
        logger.error('Cliq webhook error', error, {}, 'webhooks-cliq');
        return NextResponse.json({ ok: true }, { status: 200 });
    }
}
