import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { query } from '@/lib/db/postgres';
import type { APIResponse } from '@/types/documents';
import type { ReporteRow } from '@/lib/modules/reportes/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<NextResponse<APIResponse<any>>> {
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

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const res = await query<ReporteRow>(
      `SELECT id, desarrollo, periodo, canva_design_id, canva_export_url,
              status, error_message, metadata, generated_at, created_at, updated_at
       FROM reportes WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Reporte no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: res.rows[0] });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error obteniendo reporte' },
      { status: 500 }
    );
  }
}
