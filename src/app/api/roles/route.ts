/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ROLES API ENDPOINT
 * =====================================================
 * Endpoint para obtener roles del sistema
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRoles } from '@/lib/postgres';
import type { Role, APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER ROLES
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<Role[]>>> {
  try {
    const roles = await getRoles();

    return NextResponse.json({
      success: true,
      data: roles,
    });

  } catch (error) {
    console.error('❌ Error obteniendo roles:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo roles',
      },
      { status: 500 }
    );
  }
}

