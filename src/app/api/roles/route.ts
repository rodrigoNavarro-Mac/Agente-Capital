/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ROLES API ENDPOINT
 * =====================================================
 * Endpoint para obtener roles del sistema
 */

import {  NextResponse } from 'next/server';
import { getRoles } from '@/lib/postgres';
import { logger } from '@/lib/logger';
import type { Role, APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER ROLES
// =====================================================

export async function GET(): Promise<NextResponse<APIResponse<Role[]>>> {
  try {
    const roles = await getRoles();

    return NextResponse.json({
      success: true,
      data: roles,
    });

  } catch (error) {
    logger.error('Error obteniendo roles', error, {}, 'roles');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo roles',
      },
      { status: 500 }
    );
  }
}

