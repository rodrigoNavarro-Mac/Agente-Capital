/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - DEVELOPMENTS API ENDPOINT
 * =====================================================
 * Endpoint para obtener la estructura de zonas y desarrollos
 * disponibles en el sistema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDevelopmentsByZone, getStaticDevelopments } from '@/lib/postgres';
import { memoryCache } from '@/lib/memory-cache';
import { logger } from '@/lib/logger';
import { validateRequest, developmentRequestSchema } from '@/lib/validation';

import type { DevelopmentsByZone, APIResponse } from '@/types/documents';

// =====================================================
// ENDPOINT GET - OBTENER DESARROLLOS
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<DevelopmentsByZone>>> {
  try {
    // Obtener parámetro de query para elegir fuente
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'combined';

    // Usar caché en memoria para mejorar rendimiento
    const developments = await memoryCache.getCachedDevelopments(
      { source },
      async () => {
        let result: DevelopmentsByZone;

        switch (source) {
          case 'static':
            // Solo desarrollos hardcodeados
            result = getStaticDevelopments();
            break;

          case 'database':
            // Solo desarrollos de documentos subidos
            result = await getDevelopmentsByZone();
            break;

          case 'combined':
          default:
            // Combinar estáticos con los de base de datos
            const staticDevs = getStaticDevelopments();
            const dbDevs = await getDevelopmentsByZone();
            result = mergeDevs(staticDevs, dbDevs);
            break;
        }

        return result;
      }
    );

    // Configurar headers de caché HTTP
    const response = NextResponse.json({
      success: true,
      data: developments,
    });

    // Cachear en el cliente por 5 minutos (desarrollos cambian raramente)
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return response;

  } catch (error) {
    logger.error('Error obteniendo desarrollos', error, {}, 'developments');

    // En caso de error, retornar al menos los estáticos
    return NextResponse.json({
      success: true,
      data: getStaticDevelopments(),
      message: 'Usando datos estáticos debido a error de base de datos',
    });
  }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Combina desarrollos estáticos con los de la base de datos
 */
function mergeDevs(
  staticDevs: DevelopmentsByZone,
  dbDevs: DevelopmentsByZone
): DevelopmentsByZone {
  const merged: DevelopmentsByZone = { ...staticDevs };

  // Agregar zonas y desarrollos de la base de datos
  Object.entries(dbDevs).forEach(([zone, developments]) => {
    if (!merged[zone]) {
      merged[zone] = [];
    }
    
    // Agregar desarrollos que no estén ya incluidos
    developments.forEach((dev) => {
      if (!merged[zone].includes(dev)) {
        merged[zone].push(dev);
      }
    });
  });

  // Ordenar desarrollos alfabéticamente
  Object.keys(merged).forEach((zone) => {
    merged[zone].sort();
  });

  return merged;
}

// =====================================================
// ENDPOINT POST - AGREGAR DESARROLLO (ADMIN)
// =====================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<APIResponse<{ zone: string; development: string }>>> {
  try {
    const rawBody = await request.json();
    const validation = validateRequest(developmentRequestSchema, rawBody, 'developments');
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }
    
    const { zone, development, userId } = validation.data;

    // TODO: Verificar que el usuario es admin
    // const isAdmin = await hasPermission(userId, 'manage_developments');

    // Por ahora, solo registrar la intención
    logger.info('Solicitud de agregar desarrollo', { zone, development, userId }, 'developments');

    // En una implementación completa, aquí se guardaría en una tabla de desarrollos
    // Por ahora, los desarrollos se registran automáticamente al subir documentos

    return NextResponse.json({
      success: true,
      data: { zone, development },
      message: 'Desarrollo registrado. Los desarrollos se crean automáticamente al subir documentos.',
    });

  } catch (error) {
    logger.error('Error agregando desarrollo', error, {}, 'developments');

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error agregando desarrollo' 
      },
      { status: 500 }
    );
  }
}

