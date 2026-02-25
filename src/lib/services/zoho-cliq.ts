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

/**
 * Comprueba si el token Cliq funciona: obtiene access_token y llama a GET /channels.
 * Si listChannelsStatus === 200, el token tiene al menos permiso de lectura en Cliq.
 * Si listChannelsStatus === 401/403, el token no tiene acceso Cliq (revisa scopes al generar el refresh_token).
 * Crear canal requiere scope ZohoCliq.Channels.CREATE; este test solo verifica que el token sirva para Cliq.
 */
export async function checkCliqToken(): Promise<{
  tokenObtained: boolean;
  listChannelsStatus?: number;
  listChannelsError?: string;
  apiUrl: string;
  hint?: string;
}> {
  const apiUrl = ZOHO_CLIQ_API_URL;
  try {
    const token = await getCliqAccessToken();
    if (!token) {
      return { tokenObtained: false, apiUrl, hint: 'No se obtuvo access_token' };
    }
    const listRes = await fetchWithTimeout(
      `${ZOHO_CLIQ_API_URL}/channels`,
      {
        method: 'GET',
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      },
      CLIQ_REQUEST_TIMEOUT
    );
    const status = listRes.status;
    if (!listRes.ok) {
      const text = await listRes.text();
      let hint = '';
      if (status === 401 || status === 403) {
        hint = 'Token sin permisos Cliq. Al generar el refresh_token debes incluir scope ZohoCliq.Channels.CREATE (y en la API Console el cliente debe tener ese scope).';
      }
      return {
        tokenObtained: true,
        listChannelsStatus: status,
        listChannelsError: text.slice(0, 200),
        apiUrl,
        hint: hint || undefined,
      };
    }
    return { tokenObtained: true, listChannelsStatus: status, apiUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      tokenObtained: false,
      listChannelsError: message,
      apiUrl,
      hint: 'Revisa ZOHO_CLIQ_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET y ZOHO_CLIQ_API_URL (region: cliq.zoho.com, cliq.zoho.eu, etc.).',
    };
  }
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
 * Requires OAuth scope: ZohoCliq.Channels.CREATE (use a Cliq-enabled refresh token, not only CRM).
 * Zoho Cliq only accepts valid email addresses in email_ids; invalid values cause 400 input_pattern_mismatch.
 */
function isValidEmailForCliq(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

const MAX_CHANNEL_NAME_LENGTH = 80;

/** Sanitize for Cliq: control chars, pipe -> hyphen, trim length. */
function sanitizeChannelName(name: string): string {
  let s = (name || '')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\|/g, '-')
    .trim();
  s = s.replace(/\s*-\s*-\s*/g, ' - ').trim();
  return s.length > MAX_CHANNEL_NAME_LENGTH ? s.slice(0, MAX_CHANNEL_NAME_LENGTH) : s;
}

export async function createCliqChannel(options: CreateCliqChannelOptions): Promise<CreateCliqChannelResult> {
  const { name, description, level = 'organization', email_ids } = options;
  const token = await getCliqAccessToken();

  // Cliq REST API v2: name, level, description, invite_only, email_ids (optional)
  const validEmails = email_ids && email_ids.length > 0 ? email_ids.filter(isValidEmailForCliq) : [];
  const body: Record<string, unknown> = {
    name: sanitizeChannelName(name),
    level,
    invite_only: false,
  };
  if (description) body.description = description;
  if (validEmails.length > 0) body.email_ids = validEmails;

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
    const code = (data && typeof data.code === 'string') ? data.code : '';
    const hint = code === 'operation_failed'
      ? ' Verifica: 1) Token con scope ZohoCliq.Channels.CREATE 2) ZOHO_CLIQ_API_URL correcto para tu region (cliq.zoho.com / cliq.zoho.eu) 3) Emails pertenecen a la misma org Cliq.'
      : '';
    logger.error('createCliqChannel failed', undefined, { status: response.status, data, bodySent: body }, 'zoho-cliq');
    throw new Error(`Zoho Cliq createChannel: ${response.status} - ${JSON.stringify(data)}${hint}`);
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
