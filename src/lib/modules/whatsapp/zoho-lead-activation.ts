import { validateMexicanPhone, validateWhatsAppPhone, sendTemplateMessage } from './whatsapp-client';
import { getConversation, upsertConversation, updateState, mergeUserData } from './conversation-state';
import { isBusinessHours } from './conversation-flows';
import { createCliqChannel, addBotToCliqChannel, postMessageToCliqViaWebhook } from '@/lib/services/zoho-cliq';
import { upsertWhatsAppCliqThread, markContextSent } from '@/lib/db/whatsapp-cliq';
import { saveBridgeLog } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

export interface ZohoLeadActivationParams {
    userPhone: string;
    phoneNumberId: string;
    development: string;
    leadId?: string;
    fullName?: string;
}

export type ZohoLeadActivationStatus =
    | 'invalid_phone'
    | 'suspicious_phone'
    | 'template_sent_business_hours'
    | 'template_sent_after_hours'
    | 'unreachable';

export interface ZohoLeadActivationResult {
    success: boolean;
    status: ZohoLeadActivationStatus;
    reason?: string;
}

const MAX_TEMPLATE_RETRIES = 3;

const BIENVENIDA_TEMPLATE_BY_DEVELOPMENT: Record<string, { name: string; language: string }> = {
    FUEGO: { name: 'bienvenida_fuego', language: 'es_MX' },
    AMURA: { name: 'bienvenida_amura', language: 'es_MX' },
    PUNTO_TIERRA: { name: 'bienvenida_punto_tierra', language: 'es_MX' },
};

function getTemplateConfig(development: string): { name: string; language: string } {
    const key = (development || 'FUEGO').toUpperCase().replace(/\s+/g, '_');
    return BIENVENIDA_TEMPLATE_BY_DEVELOPMENT[key] ?? BIENVENIDA_TEMPLATE_BY_DEVELOPMENT['FUEGO'];
}

function getAssignedAgentEmailForDev(development?: string): string | null {
    try {
        const raw = process.env.CLIQ_AGENT_BY_DEVELOPMENT;
        if (!raw) return null;
        const map = JSON.parse(raw) as Record<string, string>;
        return map[development || ''] || null;
    } catch {
        return null;
    }
}

function getCliqAlwaysInviteEmails(): string[] {
    const raw = (process.env.CLIQ_ALWAYS_INVITE_EMAILS || '').trim();
    if (!raw) return [];
    return raw.split(',').map((e) => e.trim()).filter((e) => e.length > 0);
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

function buildInviteEmails(assignedAgentEmail: string | null): string[] {
    const always = getCliqAlwaysInviteEmails();
    const combined = Array.from(new Set([assignedAgentEmail, ...always].filter(Boolean) as string[]));
    return combined.filter((e) => isValidEmail(e));
}

function buildCliqActivationMessage(params: ZohoLeadActivationParams, assignedAgentEmail: string | null): string {
    const lines: string[] = [];
    lines.push('Lead activado desde Zoho CRM via WhatsApp.');
    lines.push('');
    lines.push(`Cliente: ${params.fullName || '(no indicado)'}`);
    if (params.development) lines.push(`Desarrollo: ${params.development}`);
    lines.push(`Asignado a: ${assignedAgentEmail && assignedAgentEmail.trim() ? assignedAgentEmail.trim() : '(sin asignar)'}`);
    if (params.leadId) {
        const crmBase = (process.env.ZOHO_CRM_BASE_URL || '').replace(/\/$/, '');
        const crmUrl = crmBase ? `${crmBase}/tab/Leads/${params.leadId}` : `Lead ID: ${params.leadId}`;
        lines.push('');
        lines.push('CRM:');
        lines.push(crmUrl);
    }
    return lines.join('\n');
}

export async function handleZohoLeadCreated(params: ZohoLeadActivationParams): Promise<ZohoLeadActivationResult> {
    const { userPhone, phoneNumberId, development, leadId, fullName } = params;

    // 1a. Validación local de formato y detección de números basura (sin llamada a API)
    const formatCheck = validateMexicanPhone(userPhone);
    if (formatCheck.result === 'INVALIDO') {
        logger.info('Lead phone failed local format validation', { development, reason: formatCheck.reason }, 'zoho-lead-activation');
        await upsertConversation(userPhone, development, {
            state: 'SALIDA_ELEGANTE',
            user_data: { source: 'zoho_crm', disqualified_reason: 'invalid_phone_format', format_reason: formatCheck.reason },
            is_qualified: false,
        });
        return { success: false, status: 'invalid_phone', reason: `Invalid phone format: ${formatCheck.reason}` };
    }
    if (formatCheck.result === 'SOSPECHOSO') {
        logger.warn('Lead phone is suspicious, skipping activation', { development, reason: formatCheck.reason }, 'zoho-lead-activation');
        await upsertConversation(userPhone, development, {
            state: 'SALIDA_ELEGANTE',
            user_data: { source: 'zoho_crm', lead_quality: 'BAJO', disqualified_reason: 'telefono_sospechoso', format_reason: formatCheck.reason },
            is_qualified: false,
        });
        return { success: false, status: 'suspicious_phone', reason: `Suspicious phone: ${formatCheck.reason}` };
    }

    // 1b. Validación en WhatsApp Contacts API (force_check: true, solo si formato OK)
    const validation = await validateWhatsAppPhone(phoneNumberId, userPhone);
    if (!validation.valid) {
        logger.info('Lead phone not WhatsApp-capable', { development }, 'zoho-lead-activation');
        await upsertConversation(userPhone, development, {
            state: 'SALIDA_ELEGANTE',
            user_data: { source: 'zoho_crm', disqualified_reason: 'invalid_phone' },
            is_qualified: false,
        });
        return { success: false, status: 'invalid_phone', reason: 'Phone not registered on WhatsApp' };
    }

    // 2. Send BIENVENIDA template with retry
    const template = getTemplateConfig(development);
    let templateResult = null;
    let attempts = 0;
    while (attempts < MAX_TEMPLATE_RETRIES && !templateResult) {
        attempts++;
        templateResult = await sendTemplateMessage(phoneNumberId, userPhone, template.name, template.language);
        if (!templateResult && attempts < MAX_TEMPLATE_RETRIES) {
            logger.warn('Template send failed, retrying', { development, attempt: attempts }, 'zoho-lead-activation');
        }
    }

    if (!templateResult) {
        logger.error('Template send failed after all retries, marking unreachable', undefined, { development, attempts }, 'zoho-lead-activation');
        await upsertConversation(userPhone, development, {
            state: 'SALIDA_ELEGANTE',
            user_data: { source: 'zoho_crm', disqualified_reason: 'unreachable' },
            is_qualified: false,
        });
        return { success: false, status: 'unreachable', reason: `Template send failed after ${MAX_TEMPLATE_RETRIES} attempts` };
    }

    // 3. Initialize conversation if it doesn't exist
    const existing = await getConversation(userPhone, development);
    if (!existing) {
        await upsertConversation(userPhone, development, {
            state: 'INICIO',
            user_data: { source: 'zoho_crm' },
            is_qualified: false,
        });
    } else {
        await mergeUserData(userPhone, development, { source: 'zoho_crm' });
    }

    // 4. Route by business hours
    if (isBusinessHours()) {
        // CASE A: During business hours → Cliq handover, bot stops
        const assignedAgentEmail = getAssignedAgentEmailForDev(development);
        const inviteEmails = buildInviteEmails(assignedAgentEmail);

        if (inviteEmails.length > 0) {
            try {
                const firstName = fullName ? fullName.split(' ')[0] : 'Cliente';
                const suffix = Date.now().toString(36);
                const channelName = `WA - ${development} - ${firstName} - ${userPhone.replace(/\s/g, '')}_${suffix}`;
                const { channel_id, unique_name } = await createCliqChannel({
                    name: channelName,
                    level: 'organization',
                    email_ids: inviteEmails,
                });
                await addBotToCliqChannel(unique_name);
                await upsertWhatsAppCliqThread({
                    user_phone: userPhone,
                    development,
                    phone_number_id: phoneNumberId,
                    zoho_lead_id: leadId || null,
                    assigned_agent_email: assignedAgentEmail,
                    cliq_channel_id: channel_id,
                    cliq_channel_unique_name: unique_name,
                    status: 'open',
                });
                const handoverText = buildCliqActivationMessage(params, assignedAgentEmail);
                await postMessageToCliqViaWebhook({
                    channel_id,
                    channel_unique_name: unique_name,
                    development,
                    user_phone: userPhone,
                    user_name: fullName || 'Cliente',
                    text: handoverText,
                });
                await markContextSent(userPhone, development);
                await saveBridgeLog({
                    user_phone: userPhone,
                    development,
                    direction: 'wa_cliq',
                    content: 'Handover de lead Zoho CRM enviado al canal Cliq',
                });
            } catch (err) {
                logger.error('Cliq handover failed for Zoho lead activation', err, { development }, 'zoho-lead-activation');
            }
        }

        // Bot must not continue FSM: set state to CLIENT_ACCEPTA without marking qualified
        await updateState(userPhone, development, 'CLIENT_ACCEPTA');
        logger.info('Zoho lead activated during business hours, Cliq handover done', { development }, 'zoho-lead-activation');
        return { success: true, status: 'template_sent_business_hours' };
    }

    // CASE B: Outside business hours → FSM continues on user reply (state=INICIO already set above)
    logger.info('Zoho lead activated outside business hours, FSM ready', { development }, 'zoho-lead-activation');
    return { success: true, status: 'template_sent_after_hours' };
}
