import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/canva/callback
 * Redirect URI registrada en la app de Canva.
 * No se usa en el flujo client_credentials, pero Canva la requiere
 * como campo obligatorio al registrar la aplicación.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
