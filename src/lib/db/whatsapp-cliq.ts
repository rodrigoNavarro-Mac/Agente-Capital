/**
 * WhatsApp-Cliq bridge: thread mapping (user_phone, development) <-> Cliq channel.
 * Uses whatsapp_cliq_threads table (migration 039).
 */

import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

export interface WhatsAppCliqThread {
  id: number;
  user_phone: string;
  development: string;
  phone_number_id: string;
  zoho_lead_id: string | null;
  assigned_agent_email: string | null;
  cliq_channel_id: string;
  cliq_channel_unique_name: string | null;
  /** Zoho Cliq chat id (CT_..._companyId) for browser URL */
  cliq_chat_id: string | null;
  status: string;
  /** When the initial context message was sent to this channel; null = not sent yet. */
  context_sent_at: Date | null;
  /** When we last sent a message from Cliq to WA for this channel; null = never. */
  last_cliq_wa_sent_at: Date | null;
  /** Last error when Cliq->WA send failed; null if last send succeeded. */
  last_cliq_wa_error: string | null;
  /** Last raw webhook payload from Cliq (for debugging only). */
  last_cliq_raw_payload: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertWhatsAppCliqThreadParams {
  user_phone: string;
  development: string;
  phone_number_id: string;
  zoho_lead_id?: string | null;
  assigned_agent_email?: string | null;
  cliq_channel_id: string;
  cliq_channel_unique_name?: string | null;
  status?: string;
  cliq_chat_id?: string | null;
}

export async function upsertWhatsAppCliqThread(params: UpsertWhatsAppCliqThreadParams): Promise<void> {
  const {
    user_phone,
    development,
    phone_number_id,
    zoho_lead_id = null,
    assigned_agent_email = null,
    cliq_channel_id,
    cliq_channel_unique_name = null,
    status = 'open',
    cliq_chat_id = null,
  } = params;

  await query(
    `INSERT INTO whatsapp_cliq_threads
       (user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email, cliq_channel_id, cliq_channel_unique_name, status, cliq_chat_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_phone, development)
     DO UPDATE SET
       phone_number_id = EXCLUDED.phone_number_id,
       zoho_lead_id = COALESCE(EXCLUDED.zoho_lead_id, whatsapp_cliq_threads.zoho_lead_id),
       assigned_agent_email = COALESCE(EXCLUDED.assigned_agent_email, whatsapp_cliq_threads.assigned_agent_email),
       cliq_channel_id = EXCLUDED.cliq_channel_id,
       cliq_channel_unique_name = EXCLUDED.cliq_channel_unique_name,
       cliq_chat_id = COALESCE(EXCLUDED.cliq_chat_id, whatsapp_cliq_threads.cliq_chat_id),
       status = EXCLUDED.status,
       updated_at = CURRENT_TIMESTAMP`,
    [user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email, cliq_channel_id, cliq_channel_unique_name, status, cliq_chat_id]
  );
  logger.debug('upsertWhatsAppCliqThread', { user_phone: user_phone.substring(0, 6) + '***', development, cliq_channel_id }, 'whatsapp-cliq-db');
}

export async function getCliqThreadByUserAndDev(
  user_phone: string,
  development: string
): Promise<WhatsAppCliqThread | null> {
  const result = await query<WhatsAppCliqThread>(
    `SELECT id, user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email,
            cliq_channel_id, cliq_channel_unique_name, status, context_sent_at, last_cliq_wa_sent_at, last_cliq_wa_error, created_at, updated_at
     FROM whatsapp_cliq_threads
     WHERE user_phone = $1 AND development = $2`,
    [user_phone, development]
  );
  return result.rows[0] ?? null;
}

const THREAD_SELECT = `id, user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email,
            cliq_channel_id, cliq_channel_unique_name, cliq_chat_id, status, context_sent_at, last_cliq_wa_sent_at, last_cliq_wa_error, last_cliq_raw_payload, created_at, updated_at`;

export async function getCliqThreadByChannelId(cliq_channel_id: string): Promise<WhatsAppCliqThread | null> {
  const result = await query<WhatsAppCliqThread>(
    `SELECT ${THREAD_SELECT} FROM whatsapp_cliq_threads WHERE cliq_channel_id = $1`,
    [cliq_channel_id]
  );
  let row = result.rows[0] ?? null;
  if (!row && /^\d+$/.test(cliq_channel_id)) {
    const withO = 'O' + cliq_channel_id;
    const ret2 = await query<WhatsAppCliqThread>(
      `SELECT ${THREAD_SELECT} FROM whatsapp_cliq_threads WHERE cliq_channel_id = $1`,
      [withO]
    );
    row = ret2.rows[0] ?? null;
  }
  if (!row && cliq_channel_id.startsWith('O') && cliq_channel_id.length > 1) {
    const withoutO = cliq_channel_id.slice(1);
    if (/^\d+$/.test(withoutO)) {
      const ret3 = await query<WhatsAppCliqThread>(
        `SELECT ${THREAD_SELECT} FROM whatsapp_cliq_threads WHERE cliq_channel_id = $1`,
        [withoutO]
      );
      row = ret3.rows[0] ?? null;
    }
  }
  return row;
}

/** Normalize unique name for comparison: lowercase, no #, spaces, hyphens, underscores. */
function normalizeUniqueName(name: string): string {
  return name.replace(/^#/, '').replace(/\s+/g, '').replace(/-/g, '').replace(/_/g, '').toLowerCase().trim();
}

/**
 * Find thread by channel unique name (e.g. wafuegorodrigommzte).
 * Cliq Participation Handler may send CT_... as chat.id but we store O... from create API;
 * unique_name is stable and can be sent in the payload for fallback lookup.
 */
export async function getCliqThreadByChannelUniqueName(unique_name: string): Promise<WhatsAppCliqThread | null> {
  const norm = normalizeUniqueName(unique_name);
  if (!norm) return null;
  const result = await query<WhatsAppCliqThread>(
    `SELECT ${THREAD_SELECT} FROM whatsapp_cliq_threads
     WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cliq_channel_unique_name, ''), '#', ''), ' ', ''), '-', ''), '_', '')) = $1`,
    [norm]
  );
  return result.rows[0] ?? null;
}

/** Mark that the initial context message was sent to this thread's channel (so we only send once). */
export async function markContextSent(user_phone: string, development: string): Promise<void> {
  await query(
    `UPDATE whatsapp_cliq_threads
     SET context_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE user_phone = $1 AND development = $2`,
    [user_phone, development]
  );
  logger.debug('markContextSent', { user_phone: user_phone.substring(0, 6) + '***', development }, 'whatsapp-cliq-db');
}

/** Mark successful Cliq->WA send for this thread (for dashboard / debugging). */
export async function markCliqWaSent(user_phone: string, development: string): Promise<void> {
  await query(
    `UPDATE whatsapp_cliq_threads
     SET last_cliq_wa_sent_at = CURRENT_TIMESTAMP, last_cliq_wa_error = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE user_phone = $1 AND development = $2`,
    [user_phone, development]
  );
}

/** Record Cliq->WA send failure for this channel (by channel_id) so dashboard can show last error. */
export async function setCliqWaError(cliq_channel_id: string, error_message: string): Promise<void> {
  const msg = error_message.slice(0, 500);
  const alt = cliq_channel_id.startsWith('O') ? cliq_channel_id.slice(1) : 'O' + cliq_channel_id;
  await query(
    `UPDATE whatsapp_cliq_threads
     SET last_cliq_wa_error = $1, updated_at = CURRENT_TIMESTAMP
     WHERE cliq_channel_id = $2 OR cliq_channel_id = $3`,
    [msg, cliq_channel_id, alt]
  );
}

/** Persist the CT_... chat id for a given thread (identified by user + dev). */
export async function setCliqChatIdForThread(user_phone: string, development: string, cliq_chat_id: string): Promise<void> {
  if (!cliq_chat_id) return;
  await query(
    `UPDATE whatsapp_cliq_threads
     SET cliq_chat_id = $3, updated_at = CURRENT_TIMESTAMP
     WHERE user_phone = $1 AND development = $2`,
    [user_phone, development, cliq_chat_id]
  );
}

/** Persist last raw Cliq payload for debugging. */
export async function setCliqRawPayloadForThread(user_phone: string, development: string, payload: unknown): Promise<void> {
  try {
    await query(
      `UPDATE whatsapp_cliq_threads
       SET last_cliq_raw_payload = $3, updated_at = CURRENT_TIMESTAMP
       WHERE user_phone = $1 AND development = $2`,
      [user_phone, development, payload]
    );
  } catch {
    // debug-only; no-op on error
  }
}

