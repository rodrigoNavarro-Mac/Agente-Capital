/**
 * Reintentar solo la creación del canal Cliq (sin crear lead en Zoho).
 * POST body: { user_phone: string, development: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { retryCliqOnly } from '@/lib/modules/whatsapp/conversation-flows';
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

        const result = await retryCliqOnly(user_phone, development);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error || 'Error al reintentar Cliq' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            zoho_lead_id: result.zoho_lead_id,
        });
    } catch (error) {
        logger.error('Error en retry-cliq', error, {}, 'whatsapp-api');
        return NextResponse.json(
            { success: false, error: 'Error interno al reintentar Cliq' },
            { status: 500 }
        );
    }
}
