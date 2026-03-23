import { NextRequest, NextResponse } from 'next/server';
import { query, getConfig } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const SCOPE = 'canva-callback';

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

/**
 * GET /api/auth/canva/callback
 * Canva redirige aquí con ?code=... o ?error=...
 *
 * Token exchange usa Basic Auth según docs:
 * Authorization: Basic base64(client_id:client_secret)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description') ?? '';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (error) {
    logger.warn('Canva OAuth rechazado', { error, errorDescription }, SCOPE);
    return NextResponse.redirect(
      `${appUrl}/dashboard/reportes?canva=error&reason=${encodeURIComponent(error)}&detail=${encodeURIComponent(errorDescription)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_code`);
  }

  const codeVerifier = await getConfig('canva_code_verifier_temp');
  if (!codeVerifier) {
    logger.warn('Canva: no se encontró code_verifier en BD', {}, SCOPE);
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_verifier`);
  }

  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_credentials`);
  }

  logger.info('Canva token exchange iniciado', {}, SCOPE);

  try {
    // No enviamos redirect_uri — si no se incluyó en el auth URL, no debe ir aquí tampoco
    const res = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth(clientId, clientSecret),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
      }),
    });

    const responseBody = await res.text();

    if (!res.ok) {
      logger.error('Canva token exchange falló', null, { status: res.status, body: responseBody }, SCOPE);
      return NextResponse.redirect(
        `${appUrl}/dashboard/reportes?canva=error&reason=token_exchange&detail=${encodeURIComponent(responseBody.substring(0, 300))}`
      );
    }

    const json = JSON.parse(responseBody) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    if (!json.refresh_token) {
      logger.error('Canva no devolvió refresh_token', null, { body: responseBody }, SCOPE);
      return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_refresh_token`);
    }

    await query(
      `INSERT INTO agent_config (key, value, description, updated_by)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      ['canva_refresh_token', json.refresh_token, 'Canva OAuth refresh token']
    );
    await query(`DELETE FROM agent_config WHERE key = 'canva_code_verifier_temp'`);

    logger.info('Canva conectado exitosamente', {}, SCOPE);
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=success`);

  } catch (err) {
    logger.error('Error inesperado en Canva callback', err, {}, SCOPE);
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=unexpected`);
  }
}
