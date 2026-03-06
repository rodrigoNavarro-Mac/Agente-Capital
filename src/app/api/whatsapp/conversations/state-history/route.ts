/**
 * =====================================================
 * GET /api/whatsapp/conversations/state-history
 * =====================================================
 * Devuelve el historial de transiciones de estado para una conversación.
 * Auth: mismo patrón que /logs/conversation (verifyAccessToken + canAccessConversation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { isAllowedRole, canAccessConversation } from '@/lib/modules/whatsapp/conversation-access';
import { getStateTransitions } from '@/lib/db/postgres';

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
                { error: 'No tienes permisos para ver el historial de estados.' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const user_phone = (searchParams.get('user_phone') ?? '').trim();
        const development = (searchParams.get('development') ?? '').trim();
        const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

        if (!user_phone || !development) {
            return NextResponse.json({ error: 'Parámetros requeridos: user_phone, development' }, { status: 400 });
        }

        const canAccess = await canAccessConversation(payload, development);
        if (!canAccess) {
            return NextResponse.json(
                { error: 'No tienes permiso para ver esta conversación.' },
                { status: 403 }
            );
        }

        const transitions = await getStateTransitions(user_phone, development, limit);

        return NextResponse.json({ transitions });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: `Error interno: ${msg}` }, { status: 500 });
    }
}
