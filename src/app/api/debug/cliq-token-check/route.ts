/**
 * GET /api/debug/cliq-token-check
 * Comprueba si el token de Cliq funciona: obtiene access_token y llama a GET /channels.
 * Sirve para verificar scopes: si listChannelsStatus es 200, el token tiene acceso a Cliq.
 * Crear canal requiere ademas el scope ZohoCliq.Channels.CREATE.
 */

import { NextResponse } from 'next/server';
import { checkCliqToken } from '@/lib/services/zoho-cliq';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await checkCliqToken();
    return NextResponse.json({
      ok: result.tokenObtained && result.listChannelsStatus === 200,
      tokenObtained: result.tokenObtained,
      listChannelsStatus: result.listChannelsStatus,
      listChannelsError: result.listChannelsError,
      apiUrl: result.apiUrl,
      hint: result.hint,
      scopeNote:
        result.listChannelsStatus === 200
          ? 'Token con acceso a Cliq (lectura). Si crear canal falla con operation_failed, falta scope ZohoCliq.Channels.CREATE al generar el refresh_token.'
          : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
