/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO SEGUIMIENTO LEADS DETAIL
 * =====================================================
 * Returns the LIST of leads that match the "Seguimiento" definition for a
 * given time window (and optional owner). Used by the frontend modal so
 * sales managers can drill down and see exactly which leads are being
 * followed up, and whether they were created in the same period or are
 * older leads (trazabilidad).
 *
 * Seguimiento criterion (same as /api/zoho/time-buckets):
 *   - lead_status IS NOT NULL
 *   - lead_status NOT ILIKE '%intento de contacto%'
 *   - modified_time in [from, to)
 *
 * Auth + scope rules identical to /api/zoho/time-buckets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { getUserDevelopments, query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

const FULL_ACCESS_ROLES = ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'];
const SALES_MANAGER_ROLE = 'sales_manager';
const ALLOWED_ROLES = [...FULL_ACCESS_ROLES, SALES_MANAGER_ROLE];

export interface SeguimientoLead {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  leadStatus: string | null;
  ownerName: string | null;
  desarrollo: string | null;
  leadSource: string | null;
  createdTime: string | null;
  modifiedTime: string | null;
  // True if this lead was CREATED inside the same window as the one we
  // are listing (i.e. created_time also falls in [from, to)). Lets the
  // UI split the list into "leads de este periodo" vs "anteriores".
  isSamePeriod: boolean;
}

export interface SeguimientoLeadsResponse {
  from: string;
  to: string;
  owner: string | null;
  totalSamePeriod: number;
  totalOlder: number;
  leads: SeguimientoLead[];
}

// =====================================================
// HELPERS
// =====================================================

function normalizeDevelopment(value: string): string {
  return value.trim().toLowerCase();
}

function splitCsv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const arr = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return arr.length > 0 ? arr : undefined;
}

interface Filters {
  desarrollo?: string;
  desarrollos?: string[];
  sources?: string[];
  owner?: string;
}

// =====================================================
// GET
// =====================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<SeguimientoLeadsResponse>>> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token invalido o expirado' },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(payload.role ?? '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para consultar Seguimiento.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const ownerParam = searchParams.get('owner');
    const desarrolloParam = searchParams.get('desarrollo') || undefined;
    const sourcesParam = splitCsv(searchParams.get('source'));

    if (!fromParam || !toParam) {
      return NextResponse.json(
        { success: false, error: 'Parametros "from" y "to" son requeridos (ISO date).' },
        { status: 400 }
      );
    }

    const fromDate = new Date(fromParam);
    const toDate = new Date(toParam);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Fechas invalidas.' },
        { status: 400 }
      );
    }
    if (toDate.getTime() <= fromDate.getTime()) {
      return NextResponse.json(
        { success: false, error: 'El rango es invalido: "to" debe ser mayor que "from".' },
        { status: 400 }
      );
    }

    // ---- ROLE SCOPING (clone of /api/zoho/time-buckets) ----
    const isSalesManager = payload.role === SALES_MANAGER_ROLE;
    let effectiveDesarrollo: string | undefined = desarrolloParam;
    let effectiveDesarrollos: string[] | undefined;

    if (isSalesManager) {
      const devs = await getUserDevelopments(payload.userId);
      const allowed = Array.from(
        new Set(
          devs
            .filter((d) => d.can_query)
            .map((d) => d.development)
            .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
            .map((d) => normalizeDevelopment(d))
        )
      ).sort();

      if (allowed.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No tienes desarrollos asignados.' },
          { status: 403 }
        );
      }

      if (typeof desarrolloParam === 'string' && desarrolloParam.trim().length > 0) {
        const normalized = normalizeDevelopment(desarrolloParam);
        if (!allowed.includes(normalized)) {
          return NextResponse.json(
            { success: false, error: 'No tienes permiso para ver ese desarrollo.' },
            { status: 403 }
          );
        }
        effectiveDesarrollo = normalized;
      } else {
        effectiveDesarrollo = undefined;
        effectiveDesarrollos = allowed;
      }
    }

    const filters: Filters = {
      desarrollo: effectiveDesarrollo,
      desarrollos: effectiveDesarrollos,
      sources: sourcesParam,
      owner: ownerParam ?? undefined,
    };

    // ---- BUILD QUERY ----
    const whereParts: string[] = [
      `modified_time IS NOT NULL`,
      `modified_time >= ($1::timestamptz)`,
      `modified_time <  ($2::timestamptz)`,
      `lead_status IS NOT NULL`,
      `lead_status NOT ILIKE '%intento de contacto%'`,
    ];
    const params: unknown[] = [fromDate.toISOString(), toDate.toISOString()];
    let p = 3;

    if (filters.desarrollo) {
      whereParts.push(`LOWER(TRIM(desarrollo)) = LOWER(TRIM($${p}))`);
      params.push(filters.desarrollo);
      p++;
    } else if (filters.desarrollos && filters.desarrollos.length > 0) {
      whereParts.push(`LOWER(TRIM(desarrollo)) = ANY($${p}::text[])`);
      params.push(filters.desarrollos.map((d) => d.trim().toLowerCase()));
      p++;
    }

    if (filters.sources && filters.sources.length > 0) {
      const expanded = new Set<string>(filters.sources);
      if (expanded.has('Landing Page')) expanded.add('Online Store');
      whereParts.push(`lead_source = ANY($${p}::text[])`);
      params.push(Array.from(expanded));
      p++;
    }

    if (filters.owner && filters.owner.trim().length > 0) {
      // 'Sin asignar' is what the aggregate endpoint shows when owner_name
      // is empty or NULL. Translate it back to the underlying condition so
      // the modal can drill into the same bucket the user clicked.
      if (filters.owner === 'Sin asignar') {
        whereParts.push(`(owner_name IS NULL OR TRIM(owner_name) = '')`);
      } else {
        whereParts.push(`TRIM(owner_name) = $${p}`);
        params.push(filters.owner.trim());
        p++;
      }
    }

    const sql = `
      SELECT
        id,
        full_name,
        email,
        phone,
        lead_status,
        owner_name,
        desarrollo,
        lead_source,
        created_time,
        modified_time
      FROM zoho_leads
      WHERE ${whereParts.join(' AND ')}
      ORDER BY modified_time DESC
      LIMIT 500;
    `;

    let rows: Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      lead_status: string | null;
      owner_name: string | null;
      desarrollo: string | null;
      lead_source: string | null;
      created_time: Date | string | null;
      modified_time: Date | string | null;
    }> = [];

    try {
      const result = await query(sql, params);
      rows = result.rows as typeof rows;
    } catch (e) {
      console.error('[seguimiento-leads] query FAILED', {
        sql: sql.trim(),
        params,
        error: e instanceof Error ? e.message : String(e),
      });
      logger.error('seguimiento-leads query failed', e, {}, 'zoho-seguimiento-leads');
      return NextResponse.json(
        { success: false, error: 'Error consultando leads de seguimiento.' },
        { status: 500 }
      );
    }

    // ---- BUILD RESPONSE ----
    const fromMs = fromDate.getTime();
    const toMs = toDate.getTime();

    const leads: SeguimientoLead[] = rows.map((r) => {
      const createdISO =
        r.created_time instanceof Date ? r.created_time.toISOString() : (r.created_time ?? null);
      const modifiedISO =
        r.modified_time instanceof Date ? r.modified_time.toISOString() : (r.modified_time ?? null);

      let isSamePeriod = false;
      if (createdISO) {
        const t = new Date(createdISO).getTime();
        isSamePeriod = t >= fromMs && t < toMs;
      }

      return {
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        leadStatus: r.lead_status,
        ownerName: r.owner_name,
        desarrollo: r.desarrollo,
        leadSource: r.lead_source,
        createdTime: createdISO,
        modifiedTime: modifiedISO,
        isSamePeriod,
      };
    });

    const totalSamePeriod = leads.filter((l) => l.isSamePeriod).length;
    const totalOlder = leads.length - totalSamePeriod;

    return NextResponse.json({
      success: true,
      data: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        owner: filters.owner ?? null,
        totalSamePeriod,
        totalOlder,
        leads,
      },
    });
  } catch (error) {
    console.error('[seguimiento-leads] unexpected error', error);
    logger.error(
      'seguimiento-leads unexpected error',
      error,
      {},
      'zoho-seguimiento-leads'
    );
    return NextResponse.json(
      { success: false, error: 'Error interno consultando leads de seguimiento.' },
      { status: 500 }
    );
  }
}
