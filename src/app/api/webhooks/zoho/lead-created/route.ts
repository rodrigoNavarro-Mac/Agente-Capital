/**
 * =====================================================
 * ZOHO CRM LEAD-CREATED WEBHOOK
 * =====================================================
 * POST /api/webhooks/zoho/lead-created
 *
 * Triggered by Zoho CRM when a new lead is created.
 * Payload: Form-Data with lead_id, full_name, phone, owner_id, owner_name, development [, owner_email ]
 *
 * Response is always 200 so Zoho is not blocked; processing runs after response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleZohoLeadCreatedWebhook } from '@/lib/modules/zoho/zoho-lead-webhook';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/** Reads a FormData field as string (Zoho sends all as form fields). */
function getFormString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (value == null) return undefined;
  return typeof value === 'string' ? value : value.toString();
}

function hasRequiredFields(p: {
  lead_id?: string;
  full_name?: string;
  phone?: string;
  owner_id?: string;
  owner_name?: string;
  development?: string;
}): p is {
  lead_id: string;
  full_name: string;
  phone: string;
  owner_id: string;
  owner_name: string;
  development: string;
} {
  return (
    typeof p.lead_id === 'string' &&
    p.lead_id.length > 0 &&
    typeof p.full_name === 'string' &&
    typeof p.phone === 'string' &&
    typeof p.owner_id === 'string' &&
    typeof p.owner_name === 'string' &&
    typeof p.development === 'string'
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    logger.warn('Zoho lead webhook: failed to parse Form-Data body', {}, 'webhooks-zoho-lead');
    return NextResponse.json({ received: true, error: 'invalid_body' }, { status: 200 });
  }

  const parsed = {
    lead_id: getFormString(form, 'lead_id'),
    full_name: getFormString(form, 'full_name'),
    phone: getFormString(form, 'phone'),
    owner_id: getFormString(form, 'owner_id'),
    owner_name: getFormString(form, 'owner_name'),
    development: getFormString(form, 'development'),
    owner_email: getFormString(form, 'owner_email'),
  };

  if (!hasRequiredFields(parsed)) {
    logger.warn('Zoho lead webhook: missing required fields', { keys: Object.keys(parsed) }, 'webhooks-zoho-lead');
    return NextResponse.json({ received: true, error: 'missing_fields' }, { status: 200 });
  }

  const payload = {
    lead_id: parsed.lead_id,
    full_name: parsed.full_name,
    phone: parsed.phone,
    owner_id: parsed.owner_id,
    owner_name: parsed.owner_name,
    development: parsed.development,
    owner_email: parsed.owner_email,
  };

  // Never block the webhook response: fire-and-forget promise, do not await
  void handleZohoLeadCreatedWebhook(payload)
    .then((result) => {
      logger.info('Zoho lead webhook: processing finished', { result, lead_id: payload.lead_id }, 'webhooks-zoho-lead');
    })
    .catch((err) => {
      logger.error('Zoho lead webhook: background processing failed', err, { lead_id: payload.lead_id }, 'webhooks-zoho-lead');
    });

  return NextResponse.json({ received: true }, { status: 200 });
}
