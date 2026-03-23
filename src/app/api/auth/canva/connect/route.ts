import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const SCOPE = 'design:content:write asset:read export:write';

/**
 * Genera un code_verifier aleatorio (PKCE)
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Buffer.from(array)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Calcula code_challenge a partir del verifier (SHA-256, base64url)
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(digest)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * GET /api/auth/canva/connect
 * Inicia el flujo OAuth de Canva.
 * Solo accesible para admin.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const token = extractTokenFromHeader(authHeader);
  if (!token) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Solo admins pueden conectar Canva' }, { status: 403 });
  }

  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'CANVA_CLIENT_ID no configurado' }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/canva/callback`;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${CANVA_AUTH_URL}?${params.toString()}`;

  // Guardar verifier + state en cookies (HttpOnly, válidas 10 min)
  const response = NextResponse.json({ success: true, data: { url: authUrl } });
  response.cookies.set('canva_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  });
  response.cookies.set('canva_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  });

  return response;
}
