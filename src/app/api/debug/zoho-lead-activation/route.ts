/**
 * POST /api/debug/zoho-lead-activation
 * Dispara manualmente el flujo handleZohoLeadCreated para depuración.
 * Requiere Bearer token con rol admin o ceo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleZohoLeadCreated } from '@/lib/modules/whatsapp/zoho-lead-activation';
import { getBienvenidaTemplateForDevelopment } from '@/lib/modules/whatsapp/development-content';
import { validateMexicanPhone, validateWhatsAppPhone, sendTemplateMessage } from '@/lib/modules/whatsapp/whatsapp-client';
import { isBusinessHours } from '@/lib/modules/whatsapp/conversation-flows';
import { getPhoneNumberIdByDevelopment } from '@/lib/modules/whatsapp/channel-router';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['admin', 'ceo'];

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
        send_template_only?: boolean;
    };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
    }

    const { user_phone, development, lead_id, full_name, dry_run = true, send_template_only = false } = body;

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
        if (send_template_only) {
            // Solo enviar planilla de bienvenida al número indicado (sin flujo Zoho/Cliq)
            const formatCheck = validateMexicanPhone(user_phone);
            if (formatCheck.result !== 'VALIDO') {
                return NextResponse.json({
                    ok: false,
                    error: formatCheck.reason ?? 'Teléfono inválido',
                    send_template: false,
                }, { status: 400 });
            }
            const template = getBienvenidaTemplateForDevelopment(development);
            // API WhatsApp espera número sin "+"; planilla bienvenida espera 1 param (nombre)
            const toPhone = formatCheck.normalizedNumber.replace(/^\+/, '');
            const firstName = full_name?.trim().split(/\s+/)[0] || 'Cliente';
            const sendResult = await sendTemplateMessage(
                phoneNumberId,
                toPhone,
                template.name,
                template.language,
                [firstName]
            );
            if (!sendResult) {
                return NextResponse.json({
                    ok: false,
                    error: 'Envío de planilla falló (WhatsApp API)',
                    send_template: false,
                }, { status: 500 });
            }
            return NextResponse.json({
                ok: true,
                send_template: true,
                template_name: template.name,
                message_id: sendResult.messages?.[0]?.id ?? null,
            });
        }
        if (dry_run) {
            // Solo validar sin efectos secundarios
            const businessHours = isBusinessHours();
            const template = getBienvenidaTemplateForDevelopment(development);

            // Paso 1: validación local de formato
            const formatCheck = validateMexicanPhone(user_phone);

            // Paso 2: si formato OK, verificar en WhatsApp Contacts API
            let wa_valid: boolean | null = null;
            let wa_id: string | null = null;
            if (formatCheck.result === 'VALIDO') {
                const phoneResult = await validateWhatsAppPhone(phoneNumberId, user_phone);
                wa_valid = phoneResult.valid;
                wa_id = phoneResult.wa_id ?? null;
            }

            let expected_path: string;
            if (formatCheck.result === 'INVALIDO') {
                expected_path = 'invalid_phone';
            } else if (formatCheck.result === 'SOSPECHOSO') {
                expected_path = 'suspicious_phone';
            } else if (wa_valid === false) {
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
                    format_result: formatCheck.result,
                    normalized_number: formatCheck.normalizedNumber,
                    format_reason: formatCheck.reason ?? null,
                    wa_valid,
                    wa_id,
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
