/**
 * =====================================================
 * WHATSAPP CONVERSATIONS API (Estado de conversaciones)
 * =====================================================
 * Lista conversaciones recientes para depuración / vista de estados.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecentConversations } from '@/lib/modules/whatsapp/conversation-state';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/conversations
 *
 * Query params:
 * - development (opcional): Filtrar por desarrollo (ej. FUEGO, AMURA)
 * - limit (default: 50): Cantidad de registros
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const development = searchParams.get('development') || undefined;
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);

        const rows = await getRecentConversations(limit, development);

        return NextResponse.json({
            conversations: rows,
            total: rows.length,
            limit,
            development: development || null,
        });
    } catch (error) {
        logger.error('Error fetching WhatsApp conversations', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
