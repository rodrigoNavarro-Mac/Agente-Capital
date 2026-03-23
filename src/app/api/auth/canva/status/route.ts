import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getConfig } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/canva/status
 * Devuelve si Canva está conectado (tiene refresh_token en BD).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const token = extractTokenFromHeader(authHeader);
  if (!token) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  const payload = verifyAccessToken(token);
  if (!payload) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 });

  const refreshToken = await getConfig('canva_refresh_token');
  return NextResponse.json({
    success: true,
    data: { connected: !!refreshToken },
  });
}
