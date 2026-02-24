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
  status: string;
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
  } = params;

  await query(
    `INSERT INTO whatsapp_cliq_threads
       (user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email, cliq_channel_id, cliq_channel_unique_name, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_phone, development)
     DO UPDATE SET
       phone_number_id = EXCLUDED.phone_number_id,
       zoho_lead_id = COALESCE(EXCLUDED.zoho_lead_id, whatsapp_cliq_threads.zoho_lead_id),
       assigned_agent_email = COALESCE(EXCLUDED.assigned_agent_email, whatsapp_cliq_threads.assigned_agent_email),
       cliq_channel_id = EXCLUDED.cliq_channel_id,
       cliq_channel_unique_name = EXCLUDED.cliq_channel_unique_name,
       status = EXCLUDED.status,
       updated_at = CURRENT_TIMESTAMP`,
    [user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email, cliq_channel_id, cliq_channel_unique_name, status]
  );
  logger.debug('upsertWhatsAppCliqThread', { user_phone: user_phone.substring(0, 6) + '***', development, cliq_channel_id }, 'whatsapp-cliq-db');
}

export async function getCliqThreadByUserAndDev(
  user_phone: string,
  development: string
): Promise<WhatsAppCliqThread | null> {
  const result = await query<WhatsAppCliqThread>(
    `SELECT id, user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email,
            cliq_channel_id, cliq_channel_unique_name, status, created_at, updated_at
     FROM whatsapp_cliq_threads
     WHERE user_phone = $1 AND development = $2`,
    [user_phone, development]
  );
  return result.rows[0] ?? null;
}

export async function getCliqThreadByChannelId(cliq_channel_id: string): Promise<WhatsAppCliqThread | null> {
  const result = await query<WhatsAppCliqThread>(
    `SELECT id, user_phone, development, phone_number_id, zoho_lead_id, assigned_agent_email,
            cliq_channel_id, cliq_channel_unique_name, status, created_at, updated_at
     FROM whatsapp_cliq_threads
     WHERE cliq_channel_id = $1`,
    [cliq_channel_id]
  );
  return result.rows[0] ?? null;
}
