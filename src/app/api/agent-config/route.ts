/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - AGENT CONFIG API ENDPOINT
 * =====================================================
 * Endpoint CRUD para manejar la configuración del agente:
 * - temperature
 * - top_k
 * - chunk_size
 * - restrictions
 * - system_prompt
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllConfig, 
  getConfig, 
  setConfig, 
  deleteConfig,
  hasPermission,
  saveActionLog
} from '@/lib/postgres';
import { memoryCache } from '@/lib/memory-cache';

import type { 
  APIResponse, 
  AgentSettings,
  AgentConfigUpdateRequest 
} from '@/types/documents';

// =====================================================
// CONFIGURACIÓN POR DEFECTO
// =====================================================

const DEFAULT_CONFIG: AgentSettings = {
  temperature: 0.2,
  top_k: 5,
  chunk_size: 500,
  chunk_overlap: 50,
  max_tokens: 2048,
  system_prompt: '', // Se carga desde systemPrompt.ts
  restrictions: [
    'No inventar información',
    'No proporcionar asesoría legal',
    'No revelar datos personales',
  ],
};

// =====================================================
// ENDPOINT GET - OBTENER CONFIGURACIÓN
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<AgentSettings | string>>> {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // Si se solicita una key específica
    if (key) {
      // Usar caché para configuraciones individuales
      const value = await memoryCache.getCachedConfig(
        { key },
        () => getConfig(key)
      );
      
      if (value === null) {
        return NextResponse.json({
          success: false,
          error: `Configuración '${key}' no encontrada`,
        }, { status: 404 });
      }

      const response = NextResponse.json({
        success: true,
        data: value,
      });

      // Cachear configuración por 15 minutos
      response.headers.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
      return response;
    }

    // Obtener toda la configuración con caché
    const config = await memoryCache.getCachedConfig(
      {},
      async () => {
        const dbConfig = await getAllConfig();
        
        // Combinar con valores por defecto
        return {
          temperature: parseFloat(dbConfig.temperature || String(DEFAULT_CONFIG.temperature)),
          top_k: parseInt(dbConfig.top_k || String(DEFAULT_CONFIG.top_k)),
          chunk_size: parseInt(dbConfig.chunk_size || String(DEFAULT_CONFIG.chunk_size)),
          chunk_overlap: parseInt(dbConfig.chunk_overlap || String(DEFAULT_CONFIG.chunk_overlap)),
          max_tokens: parseInt(dbConfig.max_tokens || String(DEFAULT_CONFIG.max_tokens)),
          system_prompt: dbConfig.system_prompt || DEFAULT_CONFIG.system_prompt,
          restrictions: dbConfig.restrictions 
            ? JSON.parse(dbConfig.restrictions) 
            : DEFAULT_CONFIG.restrictions,
        } as AgentSettings;
      }
    );

    const response = NextResponse.json({
      success: true,
      data: config,
    });

    // Cachear configuración completa por 15 minutos
    response.headers.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return response;

  } catch (error) {
    console.error('❌ Error obteniendo configuración:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error obteniendo configuración',
    }, { status: 500 });
  }
}

// =====================================================
// ENDPOINT POST - CREAR/ACTUALIZAR CONFIGURACIÓN
// =====================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ key: string; value: string }>>> {
  try {
    const body: AgentConfigUpdateRequest & { description?: string } = await request.json();
    const { key, value, updated_by, description } = body;

    // Validar campos requeridos
    if (!key || value === undefined || !updated_by) {
      return NextResponse.json({
        success: false,
        error: 'Se requiere key, value y updated_by',
      }, { status: 400 });
    }

    // Verificar permisos
    const canManageConfig = await hasPermission(updated_by, 'manage_config');
    if (!canManageConfig) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permisos para modificar la configuración',
      }, { status: 403 });
    }

    // Validar valor según la key
    const validationError = validateConfigValue(key, value);
    if (validationError) {
      return NextResponse.json({
        success: false,
        error: validationError,
      }, { status: 400 });
    }

    // Guardar configuración
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await setConfig(key, stringValue, updated_by, description);

    // Invalidar caché de configuración
    memoryCache.invalidate('config*');

    // Registrar acción en logs
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    await saveActionLog({
      user_id: updated_by,
      action_type: 'update',
      resource_type: 'config',
      description: `Configuración "${key}" actualizada`,
      metadata: {
        key,
        old_value: 'N/A', // No tenemos el valor anterior fácilmente
        new_value: stringValue.substring(0, 200), // Limitar tamaño
      },
      ip_address: clientIp,
      user_agent: userAgent,
    });

    console.log(`⚙️ Configuración actualizada: ${key} = ${stringValue.substring(0, 50)}...`);

    return NextResponse.json({
      success: true,
      data: { key, value: stringValue },
      message: 'Configuración actualizada exitosamente',
    });

  } catch (error) {
    console.error('❌ Error actualizando configuración:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error actualizando configuración',
    }, { status: 500 });
  }
}

// =====================================================
// ENDPOINT PUT - ACTUALIZAR MÚLTIPLES CONFIGURACIONES
// =====================================================

export async function PUT(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ updated: string[] }>>> {
  try {
    const body = await request.json();
    const { configs, updated_by } = body as { 
      configs: Array<{ key: string; value: unknown; description?: string }>;
      updated_by: number;
    };

    // Validar campos
    if (!configs || !Array.isArray(configs) || !updated_by) {
      return NextResponse.json({
        success: false,
        error: 'Se requiere configs (array) y updated_by',
      }, { status: 400 });
    }

    // Verificar permisos
    const canManageConfig = await hasPermission(updated_by, 'manage_config');
    if (!canManageConfig) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permisos para modificar la configuración',
      }, { status: 403 });
    }

    const updated: string[] = [];
    const errors: string[] = [];

    // Procesar cada configuración
    for (const config of configs) {
      const { key, value, description } = config;

      // Validar
      const validationError = validateConfigValue(key, value);
      if (validationError) {
        errors.push(`${key}: ${validationError}`);
        continue;
      }

      // Guardar
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await setConfig(key, stringValue, updated_by, description);
      updated.push(key);
    }

    // Invalidar caché de configuración después de actualizar múltiples valores
    if (updated.length > 0) {
      memoryCache.invalidate('config*');
    }

    // Registrar acción en logs
    if (updated.length > 0) {
      const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      
      await saveActionLog({
        user_id: updated_by,
        action_type: 'update',
        resource_type: 'config',
        description: `${updated.length} configuraciones actualizadas`,
        metadata: {
          keys: updated,
          errors: errors.length > 0 ? errors : undefined,
        },
        ip_address: clientIp,
        user_agent: userAgent,
      });
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: updated.length > 0,
        data: { updated },
        message: `Actualizados: ${updated.length}, Errores: ${errors.length}`,
        error: errors.join('; '),
      });
    }

    return NextResponse.json({
      success: true,
      data: { updated },
      message: `${updated.length} configuraciones actualizadas`,
    });

  } catch (error) {
    console.error('❌ Error actualizando configuraciones:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error actualizando configuraciones',
    }, { status: 500 });
  }
}

// =====================================================
// ENDPOINT DELETE - ELIMINAR CONFIGURACIÓN
// =====================================================

export async function DELETE(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ deleted: string }>>> {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const userIdParam = searchParams.get('userId');

    if (!key || !userIdParam) {
      return NextResponse.json({
        success: false,
        error: 'Se requiere key y userId como query params',
      }, { status: 400 });
    }

    const userId = parseInt(userIdParam);

    // Verificar permisos
    const canManageConfig = await hasPermission(userId, 'manage_config');
    if (!canManageConfig) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permisos para eliminar configuraciones',
      }, { status: 403 });
    }

    // Prevenir eliminar configuraciones críticas
    const protectedKeys = ['system_prompt', 'temperature', 'top_k'];
    if (protectedKeys.includes(key)) {
      return NextResponse.json({
        success: false,
        error: `La configuración '${key}' no puede ser eliminada, solo modificada`,
      }, { status: 400 });
    }

    // Eliminar
    const deleted = await deleteConfig(key);

    // Invalidar caché de configuración
    if (deleted) {
      memoryCache.invalidate('config*');
    }

    if (!deleted) {
      return NextResponse.json({
        success: false,
        error: `Configuración '${key}' no encontrada`,
      }, { status: 404 });
    }

    // Registrar acción en logs
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    await saveActionLog({
      user_id: userId,
      action_type: 'delete',
      resource_type: 'config',
      description: `Configuración "${key}" eliminada`,
      metadata: {
        key,
      },
      ip_address: clientIp,
      user_agent: userAgent,
    });

    console.log(`🗑️ Configuración eliminada: ${key}`);

    return NextResponse.json({
      success: true,
      data: { deleted: key },
      message: 'Configuración eliminada exitosamente',
    });

  } catch (error) {
    console.error('❌ Error eliminando configuración:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error eliminando configuración',
    }, { status: 500 });
  }
}

// =====================================================
// FUNCIONES DE VALIDACIÓN
// =====================================================

/**
 * Valida el valor de configuración según su key
 */
function validateConfigValue(key: string, value: unknown): string | null {
  switch (key) {
    case 'temperature':
      const temp = parseFloat(String(value));
      if (isNaN(temp) || temp < 0 || temp > 2) {
        return 'temperature debe ser un número entre 0 y 2';
      }
      break;

    case 'top_k':
      const topK = parseInt(String(value));
      if (isNaN(topK) || topK < 1 || topK > 20) {
        return 'top_k debe ser un número entre 1 y 20';
      }
      break;

    case 'chunk_size':
      const chunkSize = parseInt(String(value));
      if (isNaN(chunkSize) || chunkSize < 100 || chunkSize > 2000) {
        return 'chunk_size debe ser un número entre 100 y 2000';
      }
      break;

    case 'chunk_overlap':
      const overlap = parseInt(String(value));
      if (isNaN(overlap) || overlap < 0 || overlap > 500) {
        return 'chunk_overlap debe ser un número entre 0 y 500';
      }
      break;

    case 'max_tokens':
      const maxTokens = parseInt(String(value));
      if (isNaN(maxTokens) || maxTokens < 100 || maxTokens > 8192) {
        return 'max_tokens debe ser un número entre 100 y 8192';
      }
      break;

    case 'system_prompt':
      if (typeof value !== 'string' || value.length < 50) {
        return 'system_prompt debe ser un texto de al menos 50 caracteres';
      }
      break;

    case 'restrictions':
      if (!Array.isArray(value)) {
        return 'restrictions debe ser un array de strings';
      }
      break;

    case 'llm_provider':
      const provider = String(value);
      if (provider !== 'lmstudio' && provider !== 'openai') {
        return 'llm_provider debe ser "lmstudio" o "openai"';
      }
      break;
  }

  return null;
}

