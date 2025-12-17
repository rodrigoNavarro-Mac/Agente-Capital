/**
 * =====================================================
 * API: Procesar Ventas Comisionables desde BD Local
 * =====================================================
 * Endpoint para procesar deals cerrados-ganados desde la BD local (zoho_deals)
 * a la tabla de ventas comisionables.
 * NO llama a la API de Zoho, solo lee de la base de datos local.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { processClosedWonDealsFromLocalDB } from '@/lib/commission-db';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos para procesar ventas
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * POST /api/commissions/sync-sales
 * Procesa todos los deals cerrados-ganados desde la BD local a ventas comisionables
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    // Procesar deals desde BD local (NO llama a Zoho API)
    const result = await processClosedWonDealsFromLocalDB();

    return NextResponse.json({
      success: true,
      data: {
        processed: result.processed,
        skipped: result.skipped,
        errors: result.errors,
        errorsList: result.errorsList,
        message: `Procesamiento completado: ${result.processed} ventas nuevas, ${result.skipped} actualizadas, ${result.errors} errores`,
      },
    });
  } catch (error) {
    console.error('Error procesando ventas comisionables desde BD local:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error procesando ventas',
      },
      { status: 500 }
    );
  }
}

