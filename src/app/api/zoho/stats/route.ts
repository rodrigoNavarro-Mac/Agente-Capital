/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM STATS API
 * =====================================================
 * Endpoint para obtener estadísticas de ZOHO CRM
 * Solo accesible para CEO, ADMIN, POST-VENTA, MARKETING Y LEGAL
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { getZohoStats, getZohoStatsLastMonth } from '@/lib/zoho-crm';
import { getUserDevelopments } from '@/lib/postgres';
import type { APIResponse } from '@/types/documents';

// Forzar renderizado dinámico (esta ruta usa request.headers que es dinámico)
export const dynamic = 'force-dynamic';

// Roles permitidos para acceder a ZOHO CRM (Módulo en Desarrollo)
// Note: sales_manager is allowed, but must be restricted to assigned developments.
const FULL_ACCESS_ROLES = ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'];
const SALES_MANAGER_ROLE = 'sales_manager';
const ALLOWED_ROLES = [...FULL_ACCESS_ROLES, SALES_MANAGER_ROLE];

/**
 * Verifica si el usuario tiene permisos para acceder a ZOHO CRM
 * Optimizado: verifica el rol desde el token JWT para evitar consultas a la BD
 */
function checkZohoAccessFromToken(role?: string): boolean {
  if (!role) {
    return false;
  }
  return ALLOWED_ROLES.includes(role);
}

function normalizeDevelopment(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * GET /api/zoho/stats
 * Obtiene estadísticas generales de ZOHO CRM
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // 1. Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'No autorizado',
        },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token inválido o expirado',
        },
        { status: 401 }
      );
    }

    // 2. Verificar permisos (solo admin, ceo, post_sales, legal_manager, marketing_manager)
    // Optimizado: verificar rol desde el token sin consultar la BD
    const hasAccess = checkZohoAccessFromToken(payload.role);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para acceder a ZOHO CRM (Módulo en Desarrollo). Solo CEO, ADMIN, GERENTE DE VENTAS, POST-VENTA, LEGAL y MARKETING pueden acceder.',
        },
        { status: 403 }
      );
    }

    // 3. Obtener parámetros de consulta
    const { searchParams } = new URL(request.url);
    const desarrollo = searchParams.get('desarrollo') || undefined;
    const source = searchParams.get('source') || undefined;
    const owner = searchParams.get('owner') || undefined;
    const status = searchParams.get('status') || undefined;
    const lastMonth = searchParams.get('lastMonth') === 'true';
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const useLocal = searchParams.get('use_local') !== 'false'; // Por defecto usar BD local
    const debug = searchParams.get('debug') === '1' || searchParams.get('debug') === 'true';
    const requestId = Math.random().toString(16).slice(2);

    // 3.5) Authorization scope: sales_manager can only see assigned developments (can_query=true)
    const isSalesManager = payload.role === SALES_MANAGER_ROLE;
    let effectiveUseLocal = useLocal;
    let effectiveDesarrollo: string | undefined = desarrollo;
    let effectiveDesarrollos: string[] | undefined = undefined;

    if (isSalesManager) {
      // Always use local DB for scoped access (avoids fetching global Zoho data).
      effectiveUseLocal = true;

      const devs = await getUserDevelopments(payload.userId);
      const allowed = Array.from(
        new Set(
          devs
            .filter((d) => d.can_query)
            .map((d) => d.development)
            .filter((d) => typeof d === 'string' && d.trim().length > 0)
            .map((d) => normalizeDevelopment(d))
        )
      ).sort();

      if (allowed.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No tienes desarrollos asignados para consultar Zoho CRM. Pide a un administrador que te asigne al menos un desarrollo.',
          },
          { status: 403 }
        );
      }

      if (typeof desarrollo === 'string' && desarrollo.trim().length > 0) {
        const normalizedRequested = normalizeDevelopment(desarrollo);
        if (!allowed.includes(normalizedRequested)) {
          return NextResponse.json(
            { success: false, error: 'No tienes permiso para ver ese desarrollo en Zoho CRM.' },
            { status: 403 }
          );
        }
        effectiveDesarrollo = normalizedRequested;
        effectiveDesarrollos = undefined;
      } else {
        effectiveDesarrollo = undefined;
        effectiveDesarrollos = allowed;
      }
    }

    if (debug) {
      console.log('[zoho-stats][debug] request', {
        requestId,
        desarrollo: effectiveDesarrollo,
        desarrollosCount: effectiveDesarrollos?.length || 0,
        lastMonth,
        useLocal: effectiveUseLocal,
        source,
        owner,
        status,
        startDateRaw: searchParams.get('startDate'),
        endDateRaw: searchParams.get('endDate'),
        startDate: startDate?.toISOString?.(),
        endDate: endDate?.toISOString?.(),
        serverTzOffsetMinutes: new Date().getTimezoneOffset(),
      });
    }

    // 4. Obtener estadísticas de ZOHO CRM
    let stats;
    if (lastMonth) {
      // Si se solicita el mes anterior, usar la función específica
      stats = await getZohoStatsLastMonth(
        { desarrollo: effectiveDesarrollo, desarrollos: effectiveDesarrollos },
        effectiveUseLocal,
        debug
      );
    } else {
      // Usar filtros normales (con opción de usar BD local)
      stats = await getZohoStats({
        desarrollo: effectiveDesarrollo,
        desarrollos: effectiveDesarrollos,
        source,
        owner,
        status,
        startDate,
        endDate,
      }, effectiveUseLocal, debug);
    }

    return NextResponse.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de ZOHO:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error 
          ? error.message 
          : 'Error obteniendo estadísticas de ZOHO CRM',
      },
      { status: 500 }
    );
  }
}

