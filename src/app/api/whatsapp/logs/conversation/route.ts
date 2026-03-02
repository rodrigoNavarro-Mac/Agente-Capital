/**
 * GET /api/whatsapp/logs/conversation?user_phone=...&development=...
 * Historial de mensajes de una conversación (usuario + desarrollo) para mostrar en UI tipo chat.
 * Auth required. User can only see logs for conversations in developments they have access to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getWhatsAppLogsByConversation } from '@/lib/db/postgres';
import { canAccessConversation, isAllowedRole } from '@/lib/modules/whatsapp/conversation-access';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const authHeader = request.headers.get('authorization');
        const token = extractTokenFromHeader(authHeader);
        if (!token) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const payload = verifyAccessToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 });
        }
        if (!isAllowedRole(payload.role)) {
            return NextResponse.json(
                { error: 'No tienes permisos para ver historial de conversaciones WhatsApp.' },
                { status: 403 }
            );
        }

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

        const canAccess = await canAccessConversation(payload, development);
        if (!canAccess) {
            return NextResponse.json(
                { error: 'No tienes permiso para ver esta conversación.' },
                { status: 403 }
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
