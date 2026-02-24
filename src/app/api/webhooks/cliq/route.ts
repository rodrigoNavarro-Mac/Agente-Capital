/**
 * =====================================================
 * ZOHO CLIQ OUTGOING WEBHOOK -> WHATSAPP
 * =====================================================
 * Recibe mensajes del asesor desde Cliq (Channel Outgoing Webhook)
 * y los reenvía al usuario por WhatsApp.
 * Validación: X-Bridge-Token o query/body secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCliqThreadByChannelId } from '@/lib/db/whatsapp-cliq';
import { getPhoneNumberIdByDevelopment } from '@/lib/modules/whatsapp/channel-router';
import { sendTextMessage } from '@/lib/modules/whatsapp/whatsapp-client';
import { logger } from '@/lib/utils/logger';

const CLIQ_BRIDGE_SECRET = (process.env.CLIQ_BRIDGE_SECRET || '').trim();

function getSecretFromRequest(request: NextRequest, body: Record<string, unknown>): string | null {
    const header = request.headers.get('X-Bridge-Token');
    if (header) return header.trim();
    const q = request.nextUrl.searchParams.get('secret');
    if (q) return q.trim();
    const b = body.secret;
    if (typeof b === 'string') return b.trim();
    return null;
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
        if (!CLIQ_BRIDGE_SECRET || secret !== CLIQ_BRIDGE_SECRET) {
            logger.warn('Cliq webhook: invalid or missing secret', {}, 'webhooks-cliq');
            return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 200 });
        }

        const channel_id = typeof body.channel_id === 'string' ? body.channel_id.trim() : '';
        const message = typeof body.message === 'string' ? body.message : typeof body.text === 'string' ? body.text : '';
        const _sender = typeof body.sender === 'string' ? body.sender : '';

        if (!channel_id) {
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        // Anti-loop: ignore if message contains [WA-IN] or if sender is bot
        if (message.includes('[WA-IN]')) {
            return NextResponse.json({ ok: true, skipped: 'wa-in' }, { status: 200 });
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
