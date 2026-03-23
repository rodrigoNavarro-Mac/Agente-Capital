import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { query } from '@/lib/db/postgres';
import type { APIResponse } from '@/types/documents';
import type { ReporteRow } from '@/lib/modules/reportes/types';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const desarrollo = searchParams.get('desarrollo');

    if (!desarrollo) {
      return NextResponse.json(
        { success: false, error: 'Se requiere el parámetro desarrollo' },
        { status: 400 }
      );
    }

    const res = await query<ReporteRow>(
      `SELECT id, desarrollo, periodo, canva_design_id, canva_export_url,
              status, error_message, metadata, generated_at, created_at, updated_at
       FROM reportes
       WHERE desarrollo = $1
       ORDER BY periodo DESC`,
      [desarrollo]
    );

    return NextResponse.json({ success: true, data: res.rows });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error listando reportes' },
      { status: 500 }
    );
  }
}
