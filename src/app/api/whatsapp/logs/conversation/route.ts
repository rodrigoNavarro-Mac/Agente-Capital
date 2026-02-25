/**
 * GET /api/whatsapp/logs/conversation?user_phone=...&development=...
 * Historial de mensajes de una conversación (usuario + desarrollo) para mostrar en UI tipo chat.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppLogsByConversation } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const user_phone = searchParams.get('user_phone')?.trim() || '';
        const development = searchParams.get('development')?.trim() || '';
        const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);

        if (!user_phone || !development) {
            return NextResponse.json(
                { error: 'Faltan user_phone o development' },
                { status: 400 }
            );
        }

        const logs = await getWhatsAppLogsByConversation(user_phone, development, limit);
        return NextResponse.json({ logs });
    } catch (error) {
        logger.error('Error fetching WhatsApp conversation logs', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
