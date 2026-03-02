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

const ZOHO_CRM_BASE = (process.env.ZOHO_CRM_BASE_URL || '').replace(/\/$/, '');
const CLIQ_BASE = 'https://cliq.zoho.com';
const CLIQ_COMPANY_ID = (process.env.ZOHO_CLIQ_COMPANY_ID || '895451510').trim();

/**
 * La API de Cliq devuelve channel_id como O6261378000001323001, pero la URL real usa
 * formato CT_{id}_{companyId}, ej: CT_1424569707581655259_895451510
 */
function toCliqChatId(apiChannelId: string): string {
    if (apiChannelId.startsWith('CT_')) return apiChannelId;
    const numeric = apiChannelId.startsWith('O') ? apiChannelId.slice(1) : apiChannelId;
    if (!numeric || !/^\d+$/.test(numeric)) return apiChannelId;
    return `CT_${numeric}_${CLIQ_COMPANY_ID}`;
}

function enrichRow<
    T extends { zoho_lead_id?: string | null; cliq_channel_unique_name?: string | null; cliq_channel_id?: string | null }
>(row: T): T & { lead_url: string | null; cliq_channel_url: string | null } {
    const lead_url = row.zoho_lead_id && ZOHO_CRM_BASE ? `${ZOHO_CRM_BASE}/tab/Leads/${row.zoho_lead_id}` : null;

    let cliq_channel_url: string | null = null;
    if (CLIQ_COMPANY_ID && row.cliq_channel_id) {
        const chatId = toCliqChatId(row.cliq_channel_id);
        cliq_channel_url = `${CLIQ_BASE}/company/${CLIQ_COMPANY_ID}/chats/${chatId}`;
    }

    return {
        ...row,
        lead_url,
        cliq_channel_url,
    };
}

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
            const conversations = rows.map((r) => enrichRow(r));
            return NextResponse.json({
                conversations,
                total: conversations.length,
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
        const conversations = rows.map((r) => enrichRow(r));
        return NextResponse.json({
            conversations,
            total: conversations.length,
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
