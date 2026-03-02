/**
 * GET /api/whatsapp/conversations/kpis
 * KPIs for supervisor dashboard (same auth and filters as GET /conversations).
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getConversationKPIs } from '@/lib/modules/whatsapp/conversation-state';
import {
    getConversationAccessOptions,
    isAllowedRole,
} from '@/lib/modules/whatsapp/conversation-access';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

function normalizeDevelopment(value: string): string {
    return value.trim().toLowerCase();
}

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
                { error: 'No tienes permisos para ver KPIs de conversaciones.' },
                { status: 403 }
            );
        }

        const accessOpts = await getConversationAccessOptions(payload);
        if (!accessOpts) {
            return NextResponse.json({ error: 'No se pudo determinar acceso' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const developmentParam = searchParams.get('development')?.trim() || undefined;
        const scope = searchParams.get('scope') || 'all';

        if (accessOpts.fullAccess) {
            const kpis = await getConversationKPIs(developmentParam || undefined);
            return NextResponse.json(kpis);
        }

        if (!accessOpts.allowedDevelopments?.length) {
            return NextResponse.json(
                { error: 'No tienes desarrollos asignados.' },
                { status: 403 }
            );
        }

        let developmentsFilter: string[] = accessOpts.allowedDevelopments;
        if (developmentParam) {
            const normalized = normalizeDevelopment(developmentParam);
            if (!accessOpts.allowedDevelopments.includes(normalized)) {
                return NextResponse.json({ error: 'No tienes permiso para ese desarrollo.' }, { status: 403 });
            }
            developmentsFilter = [normalized];
        }

        const useMyLeads = scope === 'my_leads' && accessOpts.userEmail;
        const kpis = await getConversationKPIs(undefined, {
            developments: developmentsFilter,
            assignedAgentEmail: useMyLeads ? accessOpts.userEmail : undefined,
        });

        return NextResponse.json(kpis);
    } catch (error) {
        logger.error('Error fetching WhatsApp conversation KPIs', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
