/**
 * =====================================================
 * ZOHO CLIQ API CLIENT (REST API v2)
 * =====================================================
 * OAuth2 + create channel + post via Incoming Webhook (Deluge).
 * Docs: https://www.zoho.com/cliq/help/restapi/v2/
 */

import { logger } from '@/lib/utils/logger';
import { fetchWithTimeout, TIMEOUTS } from '@/lib/utils/timeout';

// =====================================================
// CONFIG
// =====================================================
// Cliq puede usar las mismas credenciales OAuth que CRM (mismo .env).
// Si no existen ZOHO_CLIQ_*, se usan ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ACCOUNTS_URL.

const ZOHO_CLIQ_ACCOUNTS_URL = process.env.ZOHO_CLIQ_ACCOUNTS_URL || process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const ZOHO_CLIQ_API_URL = (process.env.ZOHO_CLIQ_API_URL || 'https://cliq.zoho.com/api/v2').replace(/\/$/, '');
const ZOHO_CLIQ_CLIENT_ID = process.env.ZOHO_CLIQ_CLIENT_ID || process.env.ZOHO_CLIENT_ID || '';
const ZOHO_CLIQ_CLIENT_SECRET = process.env.ZOHO_CLIQ_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || '';
const ZOHO_CLIQ_REFRESH_TOKEN = process.env.ZOHO_CLIQ_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN || '';
const CLIQ_BRIDGE_SECRET = process.env.CLIQ_BRIDGE_SECRET || '';
const CLIQ_BOT_INCOMING_WEBHOOK_URL = (process.env.CLIQ_BOT_INCOMING_WEBHOOK_URL || '').trim();

const CLIQ_REQUEST_TIMEOUT = TIMEOUTS.ZOHO_REQUEST;

// =====================================================
// TOKEN CACHE
// =====================================================

interface CliqTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cliqCachedToken: string | null = null;
let cliqTokenExpiryTime = 0;

async function getCliqAccessToken(): Promise<string> {
  if (cliqCachedToken && Date.now() < cliqTokenExpiryTime) {
    return cliqCachedToken;
  }
  if (!ZOHO_CLIQ_REFRESH_TOKEN || !ZOHO_CLIQ_CLIENT_ID || !ZOHO_CLIQ_CLIENT_SECRET) {
    throw new Error('OAuth for Cliq missing: set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN (or ZOHO_CLIQ_* if different)');
  }
  let baseUrl = ZOHO_CLIQ_ACCOUNTS_URL.trim().replace(/\/$/, '');
  const idx = baseUrl.indexOf('/oauth');
  if (idx !== -1) baseUrl = baseUrl.slice(0, idx);
  const tokenUrl = `${baseUrl}/oauth/v2/token`;

  const response = await fetchWithTimeout(
    tokenUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: ZOHO_CLIQ_REFRESH_TOKEN,
        client_id: ZOHO_CLIQ_CLIENT_ID,
        client_secret: ZOHO_CLIQ_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    },
    CLIQ_REQUEST_TIMEOUT
  );

  if (!response.ok) {
    const text = await response.text();
    logger.error('Cliq token request failed', undefined, { status: response.status, text }, 'zoho-cliq');
    throw new Error(`Zoho Cliq token: ${response.status} - ${text}`);
  }

  const data: CliqTokenResponse = await response.json();
  if (!data.access_token) throw new Error('Zoho Cliq: no access_token in response');
  cliqCachedToken = data.access_token;
  cliqTokenExpiryTime = Date.now() + (data.expires_in - 300) * 1000;
  return cliqCachedToken;
}

// =====================================================
// TYPES
// =====================================================

export interface CreateCliqChannelOptions {
  name: string;
  description?: string;
  level?: 'organization' | 'team' | 'private';
  email_ids?: string[];
}

export interface CreateCliqChannelResult {
  channel_id: string;
  unique_name: string;
}

/** Payload sent to Deluge Incoming Webhook (backend -> Cliq) */
export interface CliqWebhookPayload {
  channel_id: string;
  channel_unique_name: string;
  conversation_id?: string;
  wa_message_id?: string;
  development: string;
  user_phone: string;
  user_name: string;
  text: string;
  crm_lead_url?: string;
}

// =====================================================
// API: CREATE CHANNEL
// =====================================================

/**
 * Create a Cliq channel and optionally invite users by email.
 * POST /api/v2/channels
 */
export async function createCliqChannel(options: CreateCliqChannelOptions): Promise<CreateCliqChannelResult> {
  const { name, description, level = 'organization', email_ids } = options;
  const token = await getCliqAccessToken();

  const body: Record<string, unknown> = {
    name,
    level,
  };
  if (description) body.description = description;
  if (email_ids && email_ids.length > 0) body.email_ids = email_ids;

  const response = await fetchWithTimeout(
    `${ZOHO_CLIQ_API_URL}/channels`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    CLIQ_REQUEST_TIMEOUT
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.error('createCliqChannel failed', undefined, { status: response.status, data }, 'zoho-cliq');
    throw new Error(`Zoho Cliq createChannel: ${response.status} - ${JSON.stringify(data)}`);
  }

  const channel_id = data.channel_id || data.id;
  const unique_name = data.unique_name || (data.name ? String(data.name).replace(/^#/, '').replace(/\s+/g, '').toLowerCase() : '');
  if (!channel_id || !unique_name) {
    logger.error('createCliqChannel missing id/unique_name', undefined, { data }, 'zoho-cliq');
    throw new Error('Zoho Cliq: channel_id or unique_name missing in response');
  }

  return { channel_id: String(channel_id), unique_name: String(unique_name) };
}

// =====================================================
// POST TO CLIQ VIA INCOMING WEBHOOK (DELUGE)
// =====================================================

/**
 * Send a message to Cliq by POSTing to the bot's Incoming Webhook URL.
 * Deluge handler will post to the given channel_unique_name.
 */
export async function postMessageToCliqViaWebhook(payload: CliqWebhookPayload): Promise<{ ok: boolean }> {
  if (!CLIQ_BOT_INCOMING_WEBHOOK_URL) {
    logger.warn('postMessageToCliqViaWebhook: CLIQ_BOT_INCOMING_WEBHOOK_URL not set', {}, 'zoho-cliq');
    return { ok: false };
  }
  if (!CLIQ_BRIDGE_SECRET) {
    logger.warn('postMessageToCliqViaWebhook: CLIQ_BRIDGE_SECRET not set', {}, 'zoho-cliq');
  }

  try {
    const response = await fetchWithTimeout(
      CLIQ_BOT_INCOMING_WEBHOOK_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': CLIQ_BRIDGE_SECRET,
        },
        body: JSON.stringify(payload),
      },
      CLIQ_REQUEST_TIMEOUT
    );

    const text = await response.text();
    let body: { ok?: boolean } = {};
    try {
      body = JSON.parse(text);
    } catch {
      // ignore
    }

    if (!response.ok) {
      logger.error('postMessageToCliqViaWebhook failed', undefined, { status: response.status, text }, 'zoho-cliq');
      return { ok: false };
    }
    return { ok: body.ok !== false };
  } catch (error) {
    logger.error('postMessageToCliqViaWebhook error', error, { payload: { channel_id: payload.channel_id } }, 'zoho-cliq');
    return { ok: false };
  }
}
