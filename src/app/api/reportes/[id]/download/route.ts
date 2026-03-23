import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { query } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const token = extractTokenFromHeader(authHeader);
  if (!token) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  const payload = verifyAccessToken(token);
  if (!payload) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 });

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });

  const res = await query<{ ppt_data: Buffer | null; ppt_filename: string | null; desarrollo: string; periodo: string }>(
    'SELECT ppt_data, ppt_filename, desarrollo, periodo FROM reportes WHERE id = $1',
    [id]
  );

  if (res.rows.length === 0) return NextResponse.json({ success: false, error: 'Reporte no encontrado' }, { status: 404 });

  const { ppt_data, ppt_filename, desarrollo, periodo } = res.rows[0];
  if (!ppt_data) return NextResponse.json({ success: false, error: 'El reporte no tiene archivo PPTX generado' }, { status: 404 });

  const filename = ppt_filename ?? `reporte-${desarrollo}-${periodo}.pptx`;

  return new NextResponse(new Uint8Array(ppt_data), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(ppt_data.length),
    },
  });
}
