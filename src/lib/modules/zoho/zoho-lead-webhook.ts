/**
 * =====================================================
 * ZOHO CRM LEAD-CREATED WEBHOOK HANDLER
 * =====================================================
 * Routes new leads by business hours:
 * - During business hours: create Cliq thread, add owner, send context (no bot).
 * - Outside business hours: initialize WhatsApp conversation and send welcome (bot handles until qualification).
 *
 * Does not duplicate: if a conversation already exists for (phone, development), the webhook is ignored.
 */

import { isBusinessHours } from '@/lib/business-hours';
import { getConversation, upsertConversation } from '@/lib/modules/whatsapp/conversation-state';
import { getPhoneNumberIdByDevelopment } from '@/lib/modules/whatsapp/channel-router';
import { getBienvenidaTemplateForDevelopment } from '@/lib/modules/whatsapp/development-content';
import { sendTemplateMessage, validateMexicanPhone } from '@/lib/modules/whatsapp/whatsapp-client';
import { getCliqThreadByZohoLeadId } from '@/lib/db/whatsapp-cliq';
import {
  createCliqChannel,
  addBotToCliqChannel,
  postMessageToCliqViaWebhook,
} from '@/lib/services/zoho-cliq';
import { upsertWhatsAppCliqThread } from '@/lib/db/whatsapp-cliq';
import { logger } from '@/lib/utils/logger';

// =====================================================
// TYPES
// =====================================================

export interface ZohoLeadCreatedPayload {
  lead_id: string;
  full_name: string;
  phone: string;
  owner_id: string;
  owner_name: string;
  development: string;
  /** Optional: used to add owner to Cliq thread; if missing, fallback to CLIQ_AGENT_BY_DEVELOPMENT */
  owner_email?: string;
}

export type LeadWebhookResult =
  | 'ignored_duplicate'
  | 'business_hours_cliq'
  | 'after_hours_whatsapp'
  | 'error';

// =====================================================
// CONFIG
// =====================================================

function getAssignedAgentEmail(development: string): string | null {
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
  return raw.split(',').map((e) => e.trim()).filter(Boolean);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

function buildInviteEmails(ownerEmail: string | null, development: string): string[] {
  const fallback = getAssignedAgentEmail(development);
  const owner = ownerEmail && isValidEmail(ownerEmail) ? ownerEmail : null;
  const primary = owner ?? fallback;
  const always = getCliqAlwaysInviteEmails();
  const combined = Array.from(new Set([primary, ...always].filter(Boolean) as string[]));
  return combined.filter(isValidEmail);
}

function buildLeadContextMessage(payload: ZohoLeadCreatedPayload): string {
  return [
    'Nuevo lead asignado',
    '',
    `Nombre: ${payload.full_name || '(no indicado)'}`,
    `Teléfono: ${payload.phone || '(no indicado)'}`,
    `Desarrollo: ${payload.development || '(no indicado)'}`,
    `Lead ID: ${payload.lead_id || '(no indicado)'}`,
    'Origen: Zoho CRM',
    '',
    'Puedes escribir aquí y el mensaje se enviará al cliente por WhatsApp.',
  ].join('\n');
}

// =====================================================
// HANDLER
// =====================================================

/**
 * Handles the Zoho lead-created webhook payload.
 * - If a conversation already exists for (phone, development), returns 'ignored_duplicate'.
 * - If business hours: creates Cliq thread, adds owner, sends context; does not activate bot.
 * - If outside business hours: inserts conversation (state INICIO), sends WhatsApp welcome template.
 *
 * Never throws; logs errors and returns 'error' on failure.
 */
export async function handleZohoLeadCreatedWebhook(
  payload: ZohoLeadCreatedPayload
): Promise<LeadWebhookResult> {
  const { phone, development, full_name, lead_id, owner_email } = payload;

  const phoneRaw = (phone || '').trim();
  const dev = (development || '').trim();
  if (!phoneRaw || !dev) {
    logger.warn('Zoho lead webhook: missing phone or development', { development: dev }, 'zoho-lead-webhook');
    return 'error';
  }

  const phoneCheck = validateMexicanPhone(phoneRaw);
  const normalizedForWhatsapp = phoneCheck.normalizedNumber.replace(/^\+/, '');
  const userPhone = normalizedForWhatsapp;

  if (phoneCheck.result !== 'VALIDO') {
    logger.warn('Zoho lead webhook: phone did not pass local MX validation', {
      development: dev,
      result: phoneCheck.result,
      reason: phoneCheck.reason,
    }, 'zoho-lead-webhook');
  }

  try {
    // 1. Idempotencia por lead_id (independiente del teléfono) y por (phone, development)
    if (lead_id) {
      // a) Conversación ya vinculada a este lead_id
      const existingConv = await getConversation(userPhone, dev);
      if (existingConv?.zoho_lead_id === lead_id) {
        logger.info('Zoho lead webhook: lead_id already associated to conversation, ignoring', {
          userPhone: userPhone.substring(0, 6) + '***',
          development: dev,
          lead_id,
        }, 'zoho-lead-webhook');
        return 'ignored_duplicate';
      }

      // b) Thread de Cliq ya creado para este lead_id (caso horario laboral previo)
      const existingThread = await getCliqThreadByZohoLeadId(lead_id, dev);
      if (existingThread) {
        logger.info('Zoho lead webhook: lead_id already associated to Cliq thread, ignoring', {
          development: dev,
          lead_id,
          cliq_channel_id: existingThread.cliq_channel_id,
        }, 'zoho-lead-webhook');
        return 'ignored_duplicate';
      }
    }

    const existing = await getConversation(userPhone, dev);
    if (existing) {
      logger.info('Zoho lead webhook: conversation already exists for phone+development, ignoring', {
        userPhone: userPhone.substring(0, 6) + '***',
        development: dev,
      }, 'zoho-lead-webhook');
      return 'ignored_duplicate';
    }

    if (isBusinessHours()) {
      // 2a. Business hours: create Cliq thread, add owner, send context; do NOT activate bot
      const phoneNumberId = getPhoneNumberIdByDevelopment(dev);
      if (!phoneNumberId) {
        logger.warn('Zoho lead webhook: no phone_number_id for development', { development: dev }, 'zoho-lead-webhook');
        return 'error';
      }

      const inviteEmails = buildInviteEmails(owner_email ?? null, dev);
      if (inviteEmails.length === 0) {
        logger.warn('Zoho lead webhook: no valid emails for Cliq invite', { development: dev }, 'zoho-lead-webhook');
      }

      const firstName = full_name ? full_name.split(' ')[0] : 'Cliente';
      const suffix = Date.now().toString(36);
      const channelName = `WA - ${dev} - ${firstName} - ${userPhone.replace(/\s/g, '')}_${suffix}`;

      const { channel_id, unique_name } = await createCliqChannel({
        name: channelName,
        level: 'organization',
        email_ids: inviteEmails,
      });
      await addBotToCliqChannel(unique_name);
      await upsertWhatsAppCliqThread({
        user_phone: userPhone,
        development: dev,
        phone_number_id: phoneNumberId,
        zoho_lead_id: lead_id || null,
        assigned_agent_email: owner_email ?? getAssignedAgentEmail(dev) ?? null,
        cliq_channel_id: channel_id,
        cliq_channel_unique_name: unique_name,
        status: 'open',
      });

      const messageText = buildLeadContextMessage(payload);
      await postMessageToCliqViaWebhook({
        channel_id,
        channel_unique_name: unique_name,
        development: dev,
        user_phone: userPhone,
        user_name: full_name || 'Cliente',
        text: messageText,
      });

      logger.info('Zoho lead webhook: Cliq thread created (business hours)', {
        development: dev,
        lead_id,
        channel_id,
      }, 'zoho-lead-webhook');
      return 'business_hours_cliq';
    }

    // 2b. Outside business hours: initialize WhatsApp conversation and send welcome
    const phoneNumberId = getPhoneNumberIdByDevelopment(dev);
    if (!phoneNumberId) {
      logger.warn('Zoho lead webhook: no phone_number_id for development', { development: dev }, 'zoho-lead-webhook');
      return 'error';
    }

    await upsertConversation(userPhone, dev, {
      state: 'INICIO',
      user_data: {
        name: full_name,
        lead_id,
        source: 'zoho_webhook',
      },
      is_qualified: false,
      zoho_lead_id: lead_id || null,
    });

    const template = getBienvenidaTemplateForDevelopment(dev);
    const firstName = full_name?.trim().split(/\s+/)[0] || 'Cliente';
    const sent = await sendTemplateMessage(phoneNumberId, userPhone.replace(/^\+/, ''), template.name, template.language, [firstName], template.bodyParameterNames);
    if (!sent) {
      logger.warn('Zoho lead webhook: welcome template send failed', { development: dev }, 'zoho-lead-webhook');
    }

    logger.info('Zoho lead webhook: WhatsApp conversation initialized (after hours)', {
      development: dev,
      lead_id,
      userPhone: userPhone.substring(0, 6) + '***',
    }, 'zoho-lead-webhook');
    return 'after_hours_whatsapp';
  } catch (err) {
    logger.error('Zoho lead webhook handler error', err, {
      development: payload.development,
      lead_id: payload.lead_id,
    }, 'zoho-lead-webhook');
    return 'error';
  }
}
