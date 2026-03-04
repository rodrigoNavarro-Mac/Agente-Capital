/**
 * POST /api/debug/zoho-lead-activation
 * Dispara manualmente el flujo handleZohoLeadCreated para depuración.
 * Requiere Bearer token con rol admin o ceo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleZohoLeadCreated } from '@/lib/modules/whatsapp/zoho-lead-activation';
import { validateWhatsAppPhone } from '@/lib/modules/whatsapp/whatsapp-client';
import { isBusinessHours } from '@/lib/modules/whatsapp/conversation-flows';
import { getPhoneNumberIdByDevelopment } from '@/lib/modules/whatsapp/channel-router';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['admin', 'ceo'];

const BIENVENIDA_TEMPLATE_BY_DEVELOPMENT: Record<string, { name: string; language: string }> = {
    FUEGO: { name: 'bienvenida_fuego', language: 'es_MX' },
    AMURA: { name: 'bienvenida_amura', language: 'es_MX' },
    PUNTO_TIERRA: { name: 'bienvenida_punto_tierra', language: 'es_MX' },
};

export async function POST(request: NextRequest): Promise<NextResponse> {
    // Auth
    const token = extractTokenFromHeader(request.headers.get('Authorization'));
    if (!token) {
        return NextResponse.json({ error: 'Token requerido' }, { status: 401 });
    }
    const payload = verifyAccessToken(token);
    if (!payload || !payload.role || !ALLOWED_ROLES.includes(payload.role)) {
        return NextResponse.json({ error: 'Acceso denegado: rol insuficiente' }, { status: 403 });
    }

    let body: {
        user_phone?: string;
        development?: string;
        lead_id?: string;
        full_name?: string;
        dry_run?: boolean;
    };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
    }

    const { user_phone, development, lead_id, full_name, dry_run = true } = body;

    if (!user_phone || !development) {
        return NextResponse.json(
            { error: 'Faltan campos requeridos: user_phone y development' },
            { status: 400 }
        );
    }

    const phoneNumberId = getPhoneNumberIdByDevelopment(development);
    if (!phoneNumberId) {
        return NextResponse.json(
            { error: `No hay phoneNumberId configurado para el desarrollo: ${development}` },
            { status: 400 }
        );
    }

    try {
        if (dry_run) {
            // Solo validar sin efectos secundarios
            const phoneResult = await validateWhatsAppPhone(phoneNumberId, user_phone);
            const businessHours = isBusinessHours();
            const template = BIENVENIDA_TEMPLATE_BY_DEVELOPMENT[development.toUpperCase()] ?? null;

            let expected_path: string;
            if (!phoneResult.valid) {
                expected_path = 'invalid_phone';
            } else if (businessHours) {
                expected_path = 'template_sent_business_hours';
            } else {
                expected_path = 'template_sent_after_hours';
            }

            return NextResponse.json({
                ok: true,
                dry_run: true,
                steps: {
                    phone_valid: phoneResult.valid,
                    wa_id: phoneResult.wa_id ?? null,
                    business_hours: businessHours,
                    template_name: template?.name ?? null,
                    template_language: template?.language ?? null,
                    phone_number_id: phoneNumberId,
                    expected_path,
                },
            });
        } else {
            // Live run: ejecutar flujo completo
            const result = await handleZohoLeadCreated({
                userPhone: user_phone,
                phoneNumberId,
                development,
                leadId: lead_id,
                fullName: full_name,
            });

            return NextResponse.json({
                ok: true,
                dry_run: false,
                result,
            });
        }
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
