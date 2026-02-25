/**
 * Reenviar el mensaje de contexto (nombre, intencion, horario, cita) al canal Cliq ya existente.
 * POST body: { user_phone: string, development: string }
 * Devuelve debug info (user_data_keys, hasThread, hasChannel) para diagnosticar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resendCliqContext } from '@/lib/modules/whatsapp/conversation-flows';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json();
        const user_phone = typeof body.user_phone === 'string' ? body.user_phone.trim() : '';
        const development = typeof body.development === 'string' ? body.development.trim() : '';

        if (!user_phone || !development) {
            return NextResponse.json(
                { success: false, error: 'Faltan user_phone o development' },
                { status: 400 }
            );
        }

        const result = await resendCliqContext(user_phone, development);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error || 'Error al reenviar contexto', debug: result.debug },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            debug: result.debug,
        });
    } catch (error) {
        logger.error('Error en resend-cliq-context', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { success: false, error: 'Error interno al reenviar contexto a Cliq' },
            { status: 500 }
        );
    }
}
