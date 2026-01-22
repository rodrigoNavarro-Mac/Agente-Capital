/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM FIELDS API
 * =====================================================
 * Endpoint para obtener los campos disponibles de Zoho CRM
 * Solo accesible para ADMIN
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getZohoFields } from '@/lib/services/zoho-crm';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos
const ALLOWED_ROLES = ['admin'];

/**
 * Verifica si el usuario tiene permisos
 */
function checkAccess(role?: string): boolean {
  if (!role) {
    return false;
  }
  return ALLOWED_ROLES.includes(role);
}

/**
 * GET /api/zoho/fields
 * Obtiene los campos disponibles de un módulo de Zoho CRM
 * 
 * Query params:
 * - module: 'Leads' | 'Deals' (requerido)
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

    // 2. Verificar permisos
    const hasAccess = checkAccess(payload.role);
    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'No tienes permisos para ver campos de Zoho CRM.',
        },
        { status: 403 }
      );
    }

    // 3. Obtener parámetros
    const { searchParams } = new URL(request.url);
    const moduleParam = searchParams.get('module') as 'Leads' | 'Deals' | null;

    if (!moduleParam || (moduleParam !== 'Leads' && moduleParam !== 'Deals')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Parámetro "module" requerido. Debe ser "Leads" o "Deals"',
        },
        { status: 400 }
      );
    }

    // 4. Obtener campos de Zoho
    const fieldsResponse = await getZohoFields(moduleParam);

    // 5. Organizar campos por categoría
    const organizedFields = {
      standard: fieldsResponse.fields.filter(f => !f.api_name.includes('_')),
      custom: fieldsResponse.fields.filter(f => f.api_name.includes('_')),
      byType: {
        text: fieldsResponse.fields.filter(f => f.data_type === 'text' || f.data_type === 'textarea'),
        number: fieldsResponse.fields.filter(f => f.data_type === 'integer' || f.data_type === 'double' || f.data_type === 'bigint'),
        date: fieldsResponse.fields.filter(f => f.data_type === 'date' || f.data_type === 'datetime'),
        picklist: fieldsResponse.fields.filter(f => f.pick_list_values && f.pick_list_values.length > 0),
        lookup: fieldsResponse.fields.filter(f => f.data_type === 'lookup'),
        owner: fieldsResponse.fields.filter(f => f.data_type === 'owner'),
        boolean: fieldsResponse.fields.filter(f => f.data_type === 'boolean'),
        other: fieldsResponse.fields.filter(f => 
          !['text', 'textarea', 'integer', 'double', 'bigint', 'date', 'datetime', 'lookup', 'owner', 'boolean'].includes(f.data_type)
        ),
      },
    };

    return NextResponse.json({
      success: true,
      data: {
        module: moduleParam,
        totalFields: fieldsResponse.fields.length,
        standardFields: organizedFields.standard.length,
        customFields: organizedFields.custom.length,
        fields: fieldsResponse.fields,
        organized: organizedFields,
      },
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo campos de Zoho CRM',
      },
      { status: 500 }
    );
  }
}





