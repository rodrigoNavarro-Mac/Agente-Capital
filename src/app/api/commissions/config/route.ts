/**
 * =====================================================
 * API: Configuración de Comisiones
 * =====================================================
 * Endpoints para gestionar la configuración de comisiones por desarrollo
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import {
  getCommissionConfig,
  getAllCommissionConfigs,
  upsertCommissionConfig,
  getCommissionGlobalConfigs,
  updateCommissionGlobalConfig,
} from '@/lib/commission-db';
import { validateCommissionConfig } from '@/lib/commission-calculator';
import type { APIResponse } from '@/types/documents';
import type { CommissionConfigInput } from '@/types/commissions';

export const dynamic = 'force-dynamic';

// Roles permitidos para gestionar configuración de comisiones
const ALLOWED_ROLES = ['admin', 'ceo'];

/**
 * GET /api/commissions/config
 * Obtiene todas las configuraciones de comisiones
 * Query params: ?desarrollo=xxx (opcional, para obtener una específica)
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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

    const { searchParams } = new URL(request.url);
    const desarrollo = searchParams.get('desarrollo');

    if (desarrollo) {
      // Obtener configuración específica
      const config = await getCommissionConfig(desarrollo);
      return NextResponse.json({
        success: true,
        data: config,
      });
    } else {
      // Obtener todas las configuraciones
      const configs = await getAllCommissionConfigs();
      const globalConfigs = await getCommissionGlobalConfigs();
      
      return NextResponse.json({
        success: true,
        data: {
          configs,
          globalConfigs,
        },
      });
    }
  } catch (error) {
    console.error('Error obteniendo configuración de comisiones:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo configuración',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commissions/config
 * Crea o actualiza la configuración de comisiones para un desarrollo
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
    if (!payload || !payload.userId) {
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

    const body = await request.json();
    const configInput: CommissionConfigInput = body;

    // Log para debugging
    console.log('Configuración recibida:', JSON.stringify(configInput, null, 2));

    // Validar configuración
    const validation = validateCommissionConfig(configInput);
    if (!validation.valid) {
      console.error('Errores de validación:', validation.errors);
      return NextResponse.json(
        {
          success: false,
          error: 'Configuración inválida',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    // Obtener configuración global para roles indirectos
    const globalConfigs = await getCommissionGlobalConfigs();
    const operationsPercent = globalConfigs.find(c => c.config_key === 'operations_coordinator_percent')?.config_value || 0;
    const marketingPercent = globalConfigs.find(c => c.config_key === 'marketing_percent')?.config_value || 0;

    // Agregar porcentajes globales a la configuración
    const configWithGlobals: CommissionConfigInput = {
      ...configInput,
      operations_coordinator_percent: operationsPercent,
      marketing_percent: marketingPercent,
    };

    // Guardar configuración
    const config = await upsertCommissionConfig(configWithGlobals, payload.userId);

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Error guardando configuración de comisiones:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error guardando configuración',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/commissions/config/global
 * Actualiza la configuración global de roles indirectos
 */
export async function PUT(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
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
    if (!payload || !payload.userId) {
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

    const body = await request.json();
    const { configKey, configValue } = body;

    if (!configKey || configValue === undefined) {
      return NextResponse.json(
        { success: false, error: 'configKey y configValue son requeridos' },
        { status: 400 }
      );
    }

    if (configKey !== 'operations_coordinator_percent' && configKey !== 'marketing_percent') {
      return NextResponse.json(
        { success: false, error: 'configKey inválido' },
        { status: 400 }
      );
    }

    if (configValue < 0 || configValue > 100) {
      return NextResponse.json(
        { success: false, error: 'configValue debe estar entre 0 y 100' },
        { status: 400 }
      );
    }

    const globalConfig = await updateCommissionGlobalConfig(
      configKey,
      configValue,
      payload.userId
    );

    return NextResponse.json({
      success: true,
      data: globalConfig,
    });
  } catch (error) {
    console.error('Error actualizando configuración global:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando configuración global',
      },
      { status: 500 }
    );
  }
}

