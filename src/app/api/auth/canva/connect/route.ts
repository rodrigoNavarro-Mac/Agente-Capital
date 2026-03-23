import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const SCOPE_CANVA = 'design:content:write asset:read export:write';
const SCOPE_LOG = 'canva-connect';

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Buffer.from(array)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(digest)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * GET /api/auth/canva/connect
 * Genera URL de autorización Canva y guarda code_verifier en BD.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const token = extractTokenFromHeader(authHeader);
  if (!token) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Solo admins pueden conectar Canva' }, { status: 403 });
  }

  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'CANVA_CLIENT_ID no configurado' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const redirectUri = `${appUrl}/api/auth/canva/callback`;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Guardar verifier en BD (más confiable que cookies en serverless)
  await query(
    `INSERT INTO agent_config (key, value, description, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
    ['canva_code_verifier_temp', codeVerifier, 'PKCE code_verifier temporal para OAuth Canva', payload.userId]
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE_CANVA,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${CANVA_AUTH_URL}?${params.toString()}`;
  logger.info('Canva connect iniciado', { redirectUri }, SCOPE_LOG);

  return NextResponse.json({ success: true, data: { url: authUrl } });
}
