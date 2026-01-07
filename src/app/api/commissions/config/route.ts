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
import { logger } from '@/lib/logger';
import { validateRequest, commissionConfigInputSchema } from '@/lib/validation';
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
    logger.error('Error obteniendo configuración de comisiones', error, {}, 'commissions-config');
    
    // Detectar errores específicos y proporcionar mensajes más claros
    const errorMessage = error instanceof Error ? error.message : String(error);
    let userMessage = 'Error obteniendo configuración';
    let statusCode = 500;
    
    if (errorMessage.includes('Circuit breaker is OPEN')) {
      userMessage = 'La base de datos está temporalmente no disponible. Por favor, intenta de nuevo en unos momentos.';
      statusCode = 503; // Service Unavailable
    } else if (errorMessage.includes('Tenant or user not found')) {
      userMessage = 'Error de configuración de la base de datos. Contacta al administrador del sistema.';
      statusCode = 500;
    }
    
    return NextResponse.json(
      {
        success: false,
        error: userMessage,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: statusCode }
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

    const rawBody = await request.json();
    const zodValidation = validateRequest(commissionConfigInputSchema, rawBody, 'commissions-config');
    
    if (!zodValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: zodValidation.error,
        },
        { status: zodValidation.status }
      );
    }
    
    const configInput = zodValidation.data;

    // Log para debugging
    logger.debug('Configuración recibida', { configInput }, 'commissions-config');

    // Validar configuración (validación de negocio adicional)
    // El schema de Zod usa .passthrough() que permite campos adicionales,
    // pero TypeScript no los tipa. Hacemos un cast a unknown primero y luego al tipo esperado.
    const validation = validateCommissionConfig(configInput as unknown as CommissionConfigInput);
    if (!validation.valid) {
      logger.warn('Errores de validación en configuración de comisiones', { errors: validation.errors }, 'commissions-config');
      return NextResponse.json(
        {
          success: false,
          error: 'Configuración inválida',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    // Los porcentajes globales ya no se almacenan en commission_configs
    // Se obtienen de commission_global_configs cuando se calculan las comisiones

    // Guardar configuración
    const config = await upsertCommissionConfig(configInput as unknown as CommissionConfigInput, payload.userId);

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    logger.error('Error guardando configuración de comisiones', error, {}, 'commissions-config');
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

    const validKeys = ['operations_coordinator_percent', 'marketing_percent', 'legal_manager_percent', 'post_sale_coordinator_percent'];
    if (!validKeys.includes(configKey)) {
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
    logger.error('Error actualizando configuración global', error, {}, 'commissions-config');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error actualizando configuración global',
      },
      { status: 500 }
    );
  }
}

