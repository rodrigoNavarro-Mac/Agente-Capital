/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM LEADS API
 * =====================================================
 * Endpoint para obtener leads de ZOHO CRM
 * Solo accesible para CEO, ADMIN, GERENTE DE VENTAS, POST-VENTA, MARKETING Y LEGAL
 * Nota: Los gerentes de ventas solo pueden ver leads de sus desarrollos asignados
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { getZohoLeads } from '@/lib/zoho-crm';
import { getUserDevelopments, getZohoLeadsFromDB } from '@/lib/postgres';
import { logger } from '@/lib/logger';
import type { APIResponse } from '@/types/documents';

// Forzar renderizado dinámico (esta ruta usa request.headers y request.url que son dinámicos)
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
 * GET /api/zoho/leads
 * Obtiene leads de ZOHO CRM
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

    // 2. Verificar permisos (solo admin, ceo, post_sales, legal_manager, marketing_manager, sales_manager)
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
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '200');
    const forceSync = searchParams.get('force_sync') === 'true'; // Forzar sincronización desde Zoho
    const useLocal = searchParams.get('use_local') !== 'false'; // Por defecto usar BD local
    const requestedDevelopment = searchParams.get('desarrollo') || undefined;

    // Validar parámetros
    if (page < 1) {
      return NextResponse.json(
        {
          success: false,
          error: 'El parámetro page debe ser mayor a 0',
        },
        { status: 400 }
      );
    }

    if (perPage < 1 || perPage > 200) {
      return NextResponse.json(
        {
          success: false,
          error: 'El parámetro per_page debe estar entre 1 y 200',
        },
        { status: 400 }
      );
    }

    // 4. Authorization scope: sales_manager can only see assigned developments (can_query=true)
    const isSalesManager = payload.role === SALES_MANAGER_ROLE;
    let effectiveUseLocal = useLocal;
    let effectiveForceSync = forceSync;
    let dbFilters: { desarrollo?: string; desarrollos?: string[] } | undefined = undefined;

    if (isSalesManager) {
      // Always use local DB for scoped access (avoids fetching global Zoho data).
      effectiveUseLocal = true;
      effectiveForceSync = false;

      const devs = await getUserDevelopments(payload.userId);
      const allowed = Array.from(
        new Set(
          devs
            .filter((d) => d.can_query)
            .map((d) => d.development)
            .filter((d) => typeof d === 'string' && d.trim().length > 0)
            .map((d) => normalizeDevelopment(d))
        )
      );

      if (allowed.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No tienes desarrollos asignados para consultar Zoho CRM. Pide a un administrador que te asigne al menos un desarrollo.',
          },
          { status: 403 }
        );
      }

      if (requestedDevelopment) {
        const normalizedRequested = normalizeDevelopment(requestedDevelopment);
        if (!allowed.includes(normalizedRequested)) {
          return NextResponse.json(
            {
              success: false,
              error: 'No tienes permiso para ver ese desarrollo en Zoho CRM.',
            },
            { status: 403 }
          );
        }
        dbFilters = { desarrollo: normalizedRequested };
      } else {
        dbFilters = { desarrollos: allowed.sort() };
      }
    } else if (requestedDevelopment) {
      // Optional filter for full-access roles.
      dbFilters = { desarrollo: requestedDevelopment };
    }

    // 5. Obtener leads (desde BD local o Zoho)
    let leadsResponse;
    
    if (effectiveForceSync || !effectiveUseLocal) {
      // Forzar sincronización desde Zoho
      logger.debug('Forzando sincronización desde Zoho', { forceSync: effectiveForceSync, useLocal: effectiveUseLocal }, 'zoho-leads');
      leadsResponse = await getZohoLeads(page, perPage);
    } else {
      // SIEMPRE usar BD local cuando useLocal es true
      try {
        logger.debug('Intentando obtener leads desde BD local', { page, perPage, filters: dbFilters }, 'zoho-leads');
        const localData = await getZohoLeadsFromDB(page, perPage, dbFilters);
        // Usar datos de BD local incluso si está vacío (retornar array vacío)
        leadsResponse = {
          data: localData.leads,
          info: {
            count: localData.total,
            page,
            per_page: perPage,
            more_records: (page * perPage) < localData.total,
          },
        };
        logger.debug('Leads obtenidos de BD local', { count: localData.leads.length, total: localData.total }, 'zoho-leads');
      } catch (error) {
        // Si falla la BD local, obtener desde Zoho como fallback
        logger.warn('Error obteniendo leads desde BD local, usando Zoho', { error }, 'zoho-leads');
        leadsResponse = await getZohoLeads(page, perPage);
      }
    }

    return NextResponse.json({
      success: true,
      data: leadsResponse,
    });

  } catch (error) {
    logger.error('Error obteniendo leads de ZOHO', error, {}, 'zoho-leads');
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error 
          ? error.message 
          : 'Error obteniendo leads de ZOHO CRM',
      },
      { status: 500 }
    );
  }
}

