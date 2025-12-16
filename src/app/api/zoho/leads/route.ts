/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM LEADS API
 * =====================================================
 * Endpoint para obtener leads de ZOHO CRM
 * Solo accesible para CEO, ADMIN, POST-VENTA, MARKETING Y LEGAL
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { getZohoLeads } from '@/lib/zoho-crm';
import { getZohoLeadsFromDB } from '@/lib/postgres';
import type { APIResponse } from '@/types/documents';

// Forzar renderizado dinámico (esta ruta usa request.headers y request.url que son dinámicos)
export const dynamic = 'force-dynamic';

// Roles permitidos para acceder a ZOHO CRM (Módulo en Desarrollo)
const ALLOWED_ROLES = ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'];

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

    // 2. Verificar permisos (solo admin, ceo, post_sales, legal_manager, marketing_manager)
    // Optimizado: verificar rol desde el token sin consultar la BD
    const hasAccess = checkZohoAccessFromToken(payload.role);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para acceder a ZOHO CRM (Módulo en Desarrollo). Solo CEO, ADMIN, POST-VENTA, LEGAL y MARKETING pueden acceder.',
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

    // 4. Obtener leads (desde BD local o Zoho)
    let leadsResponse;
    
    if (forceSync || !useLocal) {
      // Forzar sincronización desde Zoho
      console.log(`🔄 Forzando sincronización desde Zoho (forceSync: ${forceSync}, useLocal: ${useLocal})`);
      leadsResponse = await getZohoLeads(page, perPage);
    } else {
      // SIEMPRE usar BD local cuando useLocal es true
      try {
        console.log(`📊 Intentando obtener leads desde BD local (page: ${page}, perPage: ${perPage})`);
        const localData = await getZohoLeadsFromDB(page, perPage);
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
        console.log(`✅ Leads obtenidos de BD local: ${localData.leads.length} leads, total: ${localData.total}`);
      } catch (error) {
        // Si falla la BD local, obtener desde Zoho como fallback
        console.warn('⚠️ Error obteniendo leads desde BD local, usando Zoho:', error);
        leadsResponse = await getZohoLeads(page, perPage);
      }
    }

    return NextResponse.json({
      success: true,
      data: leadsResponse,
    });

  } catch (error) {
    console.error('❌ Error obteniendo leads de ZOHO:', error);
    
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

