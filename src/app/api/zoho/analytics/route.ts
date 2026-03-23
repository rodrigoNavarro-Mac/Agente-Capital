/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM ANALYTICS API
 * =====================================================
 * Endpoint para obtener analíticas avanzadas de ZOHO CRM:
 * velocity, heatmap, forecast, aging, scorecard, funnel.
 * Mismos roles y scope que /api/zoho/stats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import {
  getUserDevelopments,
  getZohoStageVelocity,
  getZohoCurrentStageTime,
  getZohoActivityHeatmap,
  getZohoPipelineForecast,
  getZohoLeadAging,
  getZohoOwnerScorecard,
  query,
} from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

const FULL_ACCESS_ROLES = ['admin', 'ceo', 'post_sales', 'legal_manager', 'marketing_manager'];
const SALES_MANAGER_ROLE = 'sales_manager';
const ALLOWED_ROLES = [...FULL_ACCESS_ROLES, SALES_MANAGER_ROLE];

function normalizeDevelopment(value: string): string {
  return value.trim().toLowerCase();
}

type AnalyticsType = 'funnel' | 'velocity' | 'heatmap' | 'forecast' | 'aging' | 'scorecard' | 'stagetime' | 'all';

/**
 * Obtiene el funnel de leads y deals desde la BD local.
 */
async function getZohoFunnel(filters: {
  desarrollo?: string;
  desarrollos?: string[];
  startDate?: Date;
  endDate?: Date;
}) {
  try {
    const leadConditions: string[] = [];
    const dealConditions: string[] = [];
    const params: any[] = [];
    let p = 1;

    if (filters.desarrollo) {
      leadConditions.push(`LOWER(TRIM(desarrollo)) = LOWER(TRIM($${p}))`);
      dealConditions.push(`LOWER(TRIM(desarrollo)) = LOWER(TRIM($${p}))`);
      params.push(filters.desarrollo);
      p++;
    } else if (filters.desarrollos && filters.desarrollos.length > 0) {
      leadConditions.push(`LOWER(TRIM(desarrollo)) = ANY($${p}::text[])`);
      dealConditions.push(`LOWER(TRIM(desarrollo)) = ANY($${p}::text[])`);
      params.push(filters.desarrollos.map(d => d.trim().toLowerCase()));
      p++;
    }
    if (filters.startDate) {
      leadConditions.push(`created_time >= $${p}`);
      dealConditions.push(`created_time >= $${p}`);
      params.push(filters.startDate);
      p++;
    }
    if (filters.endDate) {
      leadConditions.push(`created_time <= $${p}`);
      dealConditions.push(`created_time <= $${p}`);
      params.push(filters.endDate);
      p++;
    }

    const lWhere = leadConditions.length > 0 ? `WHERE ${leadConditions.join(' AND ')}` : '';
    const dWhere = dealConditions.length > 0 ? `WHERE ${dealConditions.join(' AND ')}` : '';

    const [leadsResult, dealsResult] = await Promise.all([
      query<{ stage: string; count: string }>(
        `SELECT lead_status AS stage, COUNT(*)::text AS count
         FROM zoho_leads ${lWhere}
         GROUP BY lead_status ORDER BY count DESC`,
        params
      ),
      query<{ stage: string; count: string }>(
        `SELECT stage, COUNT(*)::text AS count
         FROM zoho_deals ${dWhere}
         GROUP BY stage ORDER BY count DESC`,
        params
      ),
    ]);

    const totalLeads = leadsResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);
    const totalDeals = dealsResult.rows.reduce((s, r) => s + parseInt(r.count, 10), 0);

    return {
      leads: leadsResult.rows.map(r => ({
        stage: r.stage || 'Sin estado',
        count: parseInt(r.count, 10),
        pct: totalLeads > 0 ? Math.round((parseInt(r.count, 10) / totalLeads) * 100) : 0,
      })),
      deals: dealsResult.rows.map(r => ({
        stage: r.stage || 'Sin etapa',
        count: parseInt(r.count, 10),
        pct: totalDeals > 0 ? Math.round((parseInt(r.count, 10) / totalDeals) * 100) : 0,
      })),
    };
  } catch {
    return { leads: [], deals: [] };
  }
}

/**
 * GET /api/zoho/analytics
 * Query params:
 *   type: 'funnel' | 'velocity' | 'heatmap' | 'forecast' | 'aging' | 'scorecard' | 'all'
 *   desarrollo, startDate, endDate, owner
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // 1. Autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Token inválido o expirado' }, { status: 401 });
    }

    // 2. Permisos
    if (!ALLOWED_ROLES.includes(payload.role ?? '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a las analíticas de Zoho CRM.' },
        { status: 403 }
      );
    }

    // 3. Parámetros
    const { searchParams } = new URL(request.url);
    const typeParam = (searchParams.get('type') || 'all') as AnalyticsType;
    const desarrolloParam = searchParams.get('desarrollo') || undefined;
    const startDateParam = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDateParam = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const ownerParam = searchParams.get('owner') || undefined;

    // 4. Scope para sales_manager
    const isSalesManager = payload.role === SALES_MANAGER_ROLE;
    let effectiveDesarrollo: string | undefined = desarrolloParam;
    let effectiveDesarrollos: string[] | undefined;

    if (isSalesManager) {
      const devs = await getUserDevelopments(payload.userId);
      const allowed = Array.from(
        new Set(
          devs
            .filter(d => d.can_query)
            .map(d => d.development)
            .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
            .map(d => normalizeDevelopment(d))
        )
      ).sort();

      if (allowed.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No tienes desarrollos asignados para consultar analíticas.' },
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

    const filters = {
      desarrollo: effectiveDesarrollo,
      desarrollos: effectiveDesarrollos,
      startDate: startDateParam,
      endDate: endDateParam,
      owner: ownerParam,
    };

    // 5. Ejecutar solo las consultas necesarias
    const wantAll = typeParam === 'all';
    const data: Record<string, any> = {};

    const [funnel, velocity, stageTime, heatmap, forecast, aging, scorecard] = await Promise.all([
      (wantAll || typeParam === 'funnel') ? getZohoFunnel(filters) : Promise.resolve(undefined),
      (wantAll || typeParam === 'velocity') ? getZohoStageVelocity(filters) : Promise.resolve(undefined),
      (wantAll || typeParam === 'stagetime') ? getZohoCurrentStageTime(filters) : Promise.resolve(undefined),
      (wantAll || typeParam === 'heatmap') ? getZohoActivityHeatmap(filters) : Promise.resolve(undefined),
      (wantAll || typeParam === 'forecast') ? getZohoPipelineForecast(filters) : Promise.resolve(undefined),
      (wantAll || typeParam === 'aging') ? getZohoLeadAging(filters) : Promise.resolve(undefined),
      (wantAll || typeParam === 'scorecard') ? getZohoOwnerScorecard(filters) : Promise.resolve(undefined),
    ]);

    if (funnel !== undefined) data.funnel = funnel;
    if (velocity !== undefined) data.velocity = velocity;
    if (stageTime !== undefined) data.stageTime = stageTime;
    if (heatmap !== undefined) data.heatmap = heatmap;
    if (forecast !== undefined) data.forecast = forecast;
    if (aging !== undefined) data.aging = aging;
    if (scorecard !== undefined) data.scorecard = scorecard;

    return NextResponse.json({ success: true, data });

  } catch (error) {
    logger.error('Error en analytics de Zoho', error, {}, 'zoho-analytics');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error en analíticas de Zoho CRM' },
      { status: 500 }
    );
  }
}
