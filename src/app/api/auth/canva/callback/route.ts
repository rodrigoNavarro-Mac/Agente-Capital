import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const SCOPE = 'canva-callback';

/**
 * GET /api/auth/canva/callback
 * Canva redirige aquí con ?code=...&state=...
 * Intercambia el código por tokens y guarda el refresh_token en BD.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  // Error devuelto por Canva
  if (error) {
    logger.warn('Canva OAuth rechazado por el usuario', { error }, SCOPE);
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_code`);
  }

  // PKCE: el code_verifier en cookie HttpOnly es la protección CSRF suficiente
  // Canva no siempre devuelve el parámetro state
  const codeVerifier = request.cookies.get('canva_code_verifier')?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_verifier`);
  }

  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_credentials`);
  }

  const redirectUri = `${appUrl}/api/auth/canva/callback`;

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

    if (!res.ok) {
      const body = await res.text();
      logger.error('Canva token exchange falló', null, { status: res.status, body }, SCOPE);
      return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=token_exchange`);
    }

    const json = await res.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    if (!json.refresh_token) {
      logger.error('Canva no devolvió refresh_token', null, {}, SCOPE);
      return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=no_refresh_token`);
    }

    // Guardar refresh_token en agent_config
    await query(
      `INSERT INTO agent_config (key, value, description, updated_by)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      ['canva_refresh_token', json.refresh_token, 'Canva OAuth refresh token (autorizado via dashboard)']
    );

    logger.info('Canva conectado exitosamente', {}, SCOPE);

    // Limpiar cookies y redirigir con éxito
    const response = NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=success`);
    response.cookies.delete('canva_code_verifier');
    response.cookies.delete('canva_state');
    return response;

  } catch (err) {
    logger.error('Error en Canva callback', err, {}, SCOPE);
    return NextResponse.redirect(`${appUrl}/dashboard/reportes?canva=error&reason=unexpected`);
  }
}
