import { NextRequest, NextResponse } from 'next/server';
import { query, getConfig } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const SCOPE = 'canva-callback';

/**
 * GET /api/auth/canva/callback
 * Canva redirige aquí con ?code=... o ?error=...
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description') ?? '';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (error) {
    logger.warn('Canva OAuth rechazado por el usuario', { error, errorDescription }, SCOPE);
    return NextResponse.redirect(
      `${appUrl}/dashboard/reportes?canva=error&reason=${encodeURIComponent(error)}&detail=${encodeURIComponent(errorDescription)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_code`);
  }

  // Leer code_verifier desde BD (más confiable que cookies en serverless)
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

  const redirectUri = `${appUrl}/api/auth/canva/callback`;

  logger.info('Canva token exchange iniciado', { redirectUri }, SCOPE);

  try {
    const res = await fetch(CANVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      }),
    });

    const responseBody = await res.text();

    if (!res.ok) {
      logger.error('Canva token exchange falló', null, { status: res.status, body: responseBody }, SCOPE);
      return NextResponse.redirect(
        `${appUrl}/dashboard/reportes?canva=error&reason=token_exchange&detail=${encodeURIComponent(responseBody.substring(0, 200))}`
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

    // Guardar refresh_token y limpiar verifier temporal
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
