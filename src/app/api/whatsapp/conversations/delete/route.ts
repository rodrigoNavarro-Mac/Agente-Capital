/**
 * POST /api/whatsapp/conversations/delete
 * Elimina una conversación completa y todo lo relacionado en la BD,
 * y opcionalmente elimina el canal en Zoho Cliq.
 * Solo admin y ceo pueden ejecutar esta acción.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { hasFullAccess } from '@/lib/modules/whatsapp/conversation-access';
import { deleteConversationFull } from '@/lib/modules/whatsapp/conversation-state';
import { deleteCliqChannel } from '@/lib/services/zoho-cliq';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }
        const payload = verifyAccessToken(token);
        if (!payload) {
            return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });
        }
        if (!hasFullAccess(payload.role)) {
            return NextResponse.json(
                { success: false, error: 'Solo admin o ceo pueden eliminar conversaciones.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const user_phone = typeof body.user_phone === 'string' ? body.user_phone.trim() : '';
        const development = typeof body.development === 'string' ? body.development.trim() : '';

        if (!user_phone || !development) {
            return NextResponse.json(
                { success: false, error: 'Faltan user_phone o development' },
                { status: 400 }
            );
        }

        // Eliminar de la BD (obtiene cliq_channel_id antes de borrar)
        const dbResult = await deleteConversationFull(user_phone, development);

        if (!dbResult.success) {
            return NextResponse.json(
                { success: false, error: dbResult.error || 'Error al eliminar de la BD' },
                { status: 500 }
            );
        }

        // Eliminar canal de Zoho Cliq si existía
        let cliqResult: { ok: boolean; status?: number; error?: string } | null = null;
        if (dbResult.cliq_channel_id) {
            cliqResult = await deleteCliqChannel(dbResult.cliq_channel_id);
            dbResult.cliq_channel_deleted = cliqResult.ok;
        }

        logger.info('Conversation deleted via API', {
            user_phone,
            development,
            cliq_channel_id: dbResult.cliq_channel_id,
            cliq_deleted: dbResult.cliq_channel_deleted,
        }, 'whatsapp-api');

        return NextResponse.json({
            success: true,
            deleted: dbResult.deleted,
            cliq_channel_id: dbResult.cliq_channel_id,
            cliq_channel_deleted: dbResult.cliq_channel_deleted,
            cliq_error: cliqResult && !cliqResult.ok ? cliqResult.error : undefined,
        });
    } catch (error) {
        logger.error('Error en delete conversation', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { success: false, error: 'Error interno al eliminar conversación' },
            { status: 500 }
        );
    }
}
