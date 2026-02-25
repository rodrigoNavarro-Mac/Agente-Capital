/**
 * GET /api/debug/cliq-conversation?user_phone=...&development=...
 * Devuelve datos de depuracion: conversacion, thread Cliq, user_data y vista previa del contexto.
 * Sirve para ver por que no se mando el contexto o si falta el bot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConversation } from '@/lib/modules/whatsapp/conversation-state';
import { getCliqThreadByUserAndDev } from '@/lib/db/whatsapp-cliq';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const user_phone = searchParams.get('user_phone')?.trim() || '';
        const development = searchParams.get('development')?.trim() || '';

        if (!user_phone || !development) {
            return NextResponse.json(
                { error: 'Faltan user_phone o development en query' },
                { status: 400 }
            );
        }

        const conversation = await getConversation(user_phone, development);
        const thread = await getCliqThreadByUserAndDev(user_phone, development);

        const user_data = conversation?.user_data as Record<string, unknown> | undefined;
        const user_data_keys = user_data ? Object.keys(user_data) : [];
        // Derive intencion/perfil when missing (e.g. LLM path did not persist them before fix)
        const intencionRaw = user_data?.intencion ?? user_data?.perfil_compra ?? (user_data?.preferred_action === 'visita_o_llamada' ? 'Visita o llamada' : null);
        const perfilRaw = user_data?.perfil_compra ?? user_data?.intencion ?? null;
        const context_preview = {
            nombre: user_data?.name ?? user_data?.nombre ?? '(vacío)',
            intencion: intencionRaw != null ? String(intencionRaw) : '(vacío)',
            horario_preferido: user_data?.horario_preferido ?? '(vacío)',
            perfil_compra: perfilRaw != null ? String(perfilRaw) : '(vacío)',
        };

        return NextResponse.json({
            ok: true,
            conversation: conversation
                ? {
                    id: conversation.id,
                    state: conversation.state,
                    is_qualified: conversation.is_qualified,
                    zoho_lead_id: conversation.zoho_lead_id,
                    user_data_keys,
                    context_preview,
                }
                : null,
            thread: thread
                ? {
                    cliq_channel_id: thread.cliq_channel_id,
                    cliq_channel_unique_name: thread.cliq_channel_unique_name,
                    assigned_agent_email: thread.assigned_agent_email,
                    status: thread.status,
                }
                : null,
            debug: {
                has_conversation: !!conversation,
                has_thread: !!thread,
                has_channel: !!(thread?.cliq_channel_id && thread?.cliq_channel_unique_name),
                can_resend_context: !!(thread?.cliq_channel_id && thread?.cliq_channel_unique_name),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
