/**
 * =====================================================
 * WHATSAPP CONVERSATIONS API (Estado de conversaciones)
 * =====================================================
 * Lista conversaciones recientes para depuración / vista de estados.
 * Auth required. Admin/CEO: all conversations. Sales manager: only allowed developments and optional "my leads".
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getRecentConversations } from '@/lib/modules/whatsapp/conversation-state';
import {
    getConversationAccessOptions,
    isAllowedRole,
} from '@/lib/modules/whatsapp/conversation-access';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

function normalizeDevelopment(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * GET /api/whatsapp/conversations
 *
 * Query params:
 * - development (opcional): Filtrar por desarrollo (ej. FUEGO, AMURA). Sales manager: debe ser uno de sus desarrollos.
 * - limit (default: 50): Cantidad de registros (max 200)
 * - scope (opcional): "all" | "my_leads". Sales manager: "my_leads" = solo conversaciones donde assigned_agent_email = usuario actual.
 */
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
                { error: 'No tienes permisos para ver conversaciones WhatsApp. Solo Admin, CEO y Gerente de Ventas.' },
                { status: 403 }
            );
        }

        const accessOpts = await getConversationAccessOptions(payload);
        if (!accessOpts) {
            return NextResponse.json({ error: 'No se pudo determinar acceso' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const developmentParam = searchParams.get('development')?.trim() || undefined;
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
        const scope = searchParams.get('scope') || 'all';

        if (accessOpts.fullAccess) {
            // Admin/CEO: optional single development filter, no scope filter
            const rows = await getRecentConversations(limit, developmentParam || undefined);
            return NextResponse.json({
                conversations: rows,
                total: rows.length,
                limit,
                development: developmentParam || null,
                scope: null,
            });
        }

        // Sales manager: restrict to allowed developments
        if (!accessOpts.allowedDevelopments?.length) {
            return NextResponse.json(
                { error: 'No tienes desarrollos asignados para consultar conversaciones. Pide a un administrador que te asigne al menos un desarrollo.' },
                { status: 403 }
            );
        }

        let developmentsFilter: string[] = accessOpts.allowedDevelopments;
        if (developmentParam) {
            const normalized = normalizeDevelopment(developmentParam);
            if (!accessOpts.allowedDevelopments.includes(normalized)) {
                return NextResponse.json(
                    { error: 'No tienes permiso para ver ese desarrollo.' },
                    { status: 403 }
                );
            }
            developmentsFilter = [normalized];
        }

        const useMyLeads = scope === 'my_leads' && accessOpts.userEmail;
        const rows = await getRecentConversations(limit, undefined, {
            developments: developmentsFilter,
            assignedAgentEmail: useMyLeads ? accessOpts.userEmail : undefined,
        });

        return NextResponse.json({
            conversations: rows,
            total: rows.length,
            limit,
            development: developmentParam || null,
            scope: useMyLeads ? 'my_leads' : 'all',
        });
    } catch (error) {
        logger.error('Error fetching WhatsApp conversations', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
