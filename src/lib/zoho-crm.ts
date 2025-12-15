/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - ZOHO CRM CLIENT
 * =====================================================
 * Cliente para interactuar con la API de ZOHO CRM
 * 
 * Documentación: https://www.zoho.com/crm/developer/docs/api/v2/
 */

// =====================================================
// TIPOS Y INTERFACES
// =====================================================

export interface ZohoNote {
  id: string;
  Note_Title?: string;
  Note_Content?: string;
  Created_Time?: string;
  Modified_Time?: string;
  Owner?: {
    id: string;
    name: string;
  };
  Parent_Id?: {
    id: string;
    name: string;
  };
  [key: string]: any; // Para campos adicionales
}

export interface ZohoLead {
  id: string;
  Full_Name?: string;
  Email?: string;
  Phone?: string;
  Company?: string;
  Lead_Status?: string;
  Lead_Source?: string;
  Industry?: string;
  Desarrollo?: string; // Campo para filtrar por desarrollo
  Motivo_Descarte?: string; // Motivo de descarte del lead
  Tiempo_En_Fase?: number; // Tiempo en días en la fase actual
  Created_Time?: string;
  Modified_Time?: string;
  Owner?: {
    id: string;
    name: string;
  };
  Notes?: ZohoNote[]; // Notas asociadas al lead
  [key: string]: any; // Para campos adicionales
}

export interface ZohoDeal {
  id: string;
  Deal_Name?: string;
  Amount?: number;
  Stage?: string;
  Closing_Date?: string;
  Probability?: number;
  Lead_Source?: string;
  Type?: string;
  Desarrollo?: string; // Campo para filtrar por desarrollo
  Motivo_Descarte?: string; // Motivo de descarte del deal
  Tiempo_En_Fase?: number; // Tiempo en días en la fase actual
  Created_Time?: string;
  Modified_Time?: string;
  Owner?: {
    id: string;
    name: string;
  };
  Account_Name?: {
    id: string;
    name: string;
  };
  Notes?: ZohoNote[]; // Notas asociadas al deal
  [key: string]: any; // Para campos adicionales
}

export interface ZohoPipelineStage {
  id: string;
  name: string;
  display_order: number;
  probability: number;
}

export interface ZohoPipeline {
  id: string;
  name: string;
  stages: ZohoPipelineStage[];
}

export interface ZohoLeadsResponse {
  data: ZohoLead[];
  info?: {
    count?: number;
    page?: number;
    per_page?: number;
    more_records?: boolean;
  };
}

export interface ZohoDealsResponse {
  data: ZohoDeal[];
  info?: {
    count?: number;
    page?: number;
    per_page?: number;
    more_records?: boolean;
  };
}

export interface ZohoPipelinesResponse {
  data: ZohoPipeline[];
}

export interface ZohoStats {
  totalLeads: number;
  totalDeals: number;
  leadsByStatus: Record<string, number>;
  dealsByStage: Record<string, number>;
  totalDealValue: number;
  averageDealValue: number;
  // Estadísticas por desarrollo
  leadsByDevelopment?: Record<string, number>;
  dealsByDevelopment?: Record<string, number>;
  dealValueByDevelopment?: Record<string, number>;
  // Estadísticas temporales
  leadsByDate?: Record<string, number>;
  dealsByDate?: Record<string, number>;
  dealValueByDate?: Record<string, number>;
  // Análisis de embudos
  leadsFunnel?: Record<string, number>; // Embudo de leads por estado
  dealsFunnel?: Record<string, number>; // Embudo de deals por etapa
  // Tiempos en fases
  averageTimeInPhaseLeads?: Record<string, number>; // Tiempo promedio en días por estado
  averageTimeInPhaseDeals?: Record<string, number>; // Tiempo promedio en días por etapa
  // Motivos de descarte
  leadsDiscardReasons?: Record<string, number>; // Motivos de descarte de leads
  dealsDiscardReasons?: Record<string, number>; // Motivos de descarte de deals
}

// =====================================================
// CONFIGURACIÓN
// =====================================================

const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const ZOHO_CRM_API_URL = process.env.ZOHO_CRM_API_URL || 'https://www.zohoapis.com/crm/v2';
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN || '';

// =====================================================
// GESTIÓN DE TOKENS
// =====================================================

interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiryTime: number = 0;

/**
 * Obtiene un token de acceso de ZOHO CRM usando el refresh token
 * Los tokens de ZOHO expiran después de 1 hora
 */
async function getAccessToken(): Promise<string> {
  // Si tenemos un token válido en caché, lo retornamos
  if (cachedAccessToken && Date.now() < tokenExpiryTime) {
    return cachedAccessToken;
  }

  // Validar que las variables de entorno estén configuradas
  if (!ZOHO_REFRESH_TOKEN) {
    throw new Error('ZOHO_REFRESH_TOKEN no está configurado en las variables de entorno. Por favor, configura esta variable en Vercel.');
  }

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    throw new Error('ZOHO_CLIENT_ID y ZOHO_CLIENT_SECRET deben estar configurados en las variables de entorno. Por favor, configura estas variables en Vercel.');
  }

  // Validar que la URL de accounts esté configurada
  if (!ZOHO_ACCOUNTS_URL) {
    throw new Error('ZOHO_ACCOUNTS_URL no está configurado. Usa: https://accounts.zoho.com (o la URL correspondiente a tu región)');
  }

  // Normalizar la URL: remover cualquier ruta duplicada
  // Si la URL ya contiene /oauth/v2/token, usar solo la base
  let normalizedAccountsUrl = ZOHO_ACCOUNTS_URL.trim();
  
  // Remover trailing slash
  if (normalizedAccountsUrl.endsWith('/')) {
    normalizedAccountsUrl = normalizedAccountsUrl.slice(0, -1);
  }
  
  // Si la URL ya contiene /oauth/v2/token, extraer solo la base
  const oauthPathIndex = normalizedAccountsUrl.indexOf('/oauth/v2/token');
  if (oauthPathIndex !== -1) {
    normalizedAccountsUrl = normalizedAccountsUrl.substring(0, oauthPathIndex);
  }
  
  // Construir la URL del token correctamente
  const tokenUrl = `${normalizedAccountsUrl}/oauth/v2/token`;
  
  console.log('🔑 Intentando obtener token de Zoho...', {
    accountsUrl: ZOHO_ACCOUNTS_URL,
    tokenUrl,
    hasClientId: !!ZOHO_CLIENT_ID,
    hasClientSecret: !!ZOHO_CLIENT_SECRET,
    hasRefreshToken: !!ZOHO_REFRESH_TOKEN,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: ZOHO_REFRESH_TOKEN,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Si es un 404, dar un mensaje más útil
      if (response.status === 404) {
        throw new Error(
          `Error 404: La URL de Zoho Accounts no es correcta. ` +
          `URL intentada: ${tokenUrl}. ` +
          `Verifica que ZOHO_ACCOUNTS_URL esté configurado correctamente. ` +
          `Si tu cuenta está en EU, usa: https://accounts.zoho.eu. ` +
          `Si está en IN, usa: https://accounts.zoho.in. ` +
          `Si está en AU, usa: https://accounts.zoho.com.au. ` +
          `Para la región estándar (US), usa: https://accounts.zoho.com`
        );
      }
      
      // Intentar parsear como JSON si es posible
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          errorMessage = errorJson.error;
        } else if (errorJson.error_description) {
          errorMessage = errorJson.error_description;
        }
      } catch {
        // Si no es JSON, usar el texto tal cual
      }
      
      throw new Error(`Error obteniendo token de ZOHO (${response.status}): ${errorMessage}`);
    }

    const tokenData: ZohoTokenResponse = await response.json();
    
    if (!tokenData.access_token) {
      throw new Error('La respuesta de Zoho no contiene access_token');
    }
    
    // Guardar token en caché con 5 minutos de margen antes de la expiración
    cachedAccessToken = tokenData.access_token;
    tokenExpiryTime = Date.now() + (tokenData.expires_in - 300) * 1000;

    console.log('✅ Token de Zoho obtenido exitosamente');
    return tokenData.access_token;
  } catch (error) {
    console.error('❌ Error obteniendo token de ZOHO CRM:', {
      error: error instanceof Error ? error.message : String(error),
      tokenUrl,
      accountsUrl: ZOHO_ACCOUNTS_URL,
    });
    throw error;
  }
}

// =====================================================
// FUNCIONES DE API
// =====================================================

/**
 * Realiza una petición autenticada a la API de ZOHO CRM
 */
async function zohoRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${ZOHO_CRM_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Error en petición a ZOHO CRM (${endpoint}):`, {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(`Error en ZOHO CRM: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // ZOHO puede retornar errores en el cuerpo de la respuesta
  if (data.data && data.data[0] && data.data[0].status === 'error') {
    throw new Error(data.data[0].message || 'Error desconocido de ZOHO CRM');
  }

  return data;
}

/**
 * Obtiene todos los leads de ZOHO CRM
 * @param page Página a obtener (por defecto 1)
 * @param perPage Registros por página (máximo 200, por defecto 200)
 */
export async function getZohoLeads(page: number = 1, perPage: number = 200): Promise<ZohoLeadsResponse> {
  try {
    const response = await zohoRequest<ZohoLeadsResponse>(
      `/Leads?page=${page}&per_page=${perPage}`
    );
    return response;
  } catch (error) {
    console.error('❌ Error obteniendo leads de ZOHO:', error);
    throw error;
  }
}

/**
 * Obtiene todos los deals de ZOHO CRM
 * @param page Página a obtener (por defecto 1)
 * @param perPage Registros por página (máximo 200, por defecto 200)
 */
export async function getZohoDeals(page: number = 1, perPage: number = 200): Promise<ZohoDealsResponse> {
  try {
    const response = await zohoRequest<ZohoDealsResponse>(
      `/Deals?page=${page}&per_page=${perPage}`
    );
    return response;
  } catch (error) {
    console.error('❌ Error obteniendo deals de ZOHO:', error);
    throw error;
  }
}

/**
 * Obtiene todos los pipelines de ZOHO CRM
 */
export async function getZohoPipelines(): Promise<ZohoPipelinesResponse> {
  try {
    const response = await zohoRequest<ZohoPipelinesResponse>('/settings/pipelines');
    return response;
  } catch (error) {
    console.error('❌ Error obteniendo pipelines de ZOHO:', error);
    throw error;
  }
}

/**
 * Interfaz para campos de Zoho CRM
 */
export interface ZohoField {
  api_name: string;
  data_type: string;
  display_label: string;
  required?: boolean;
  read_only?: boolean;
  length?: number;
  decimal_place?: number;
  pick_list_values?: Array<{
    display_value: string;
    sequence_number: number;
    actual_value: string;
  }>;
}

export interface ZohoFieldsResponse {
  fields: ZohoField[];
}

/**
 * Obtiene todos los campos disponibles de un módulo de ZOHO CRM
 * @param module Nombre del módulo (Leads, Deals, etc.)
 */
export async function getZohoFields(module: 'Leads' | 'Deals'): Promise<ZohoFieldsResponse> {
  try {
    const response = await zohoRequest<{ fields: ZohoField[] }>(`/settings/fields?module=${module}`);
    return { fields: response.fields || [] };
  } catch (error) {
    console.error(`❌ Error obteniendo campos de ${module} de ZOHO:`, error);
    throw error;
  }
}

/**
 * Obtiene las notas asociadas a un lead o deal
 * @param module Nombre del módulo (Leads o Deals)
 * @param recordId ID del registro (lead o deal)
 */
export async function getZohoNotes(module: 'Leads' | 'Deals', recordId: string): Promise<ZohoNote[]> {
  try {
    const response = await zohoRequest<{ data: ZohoNote[] }>(`/${module}/${recordId}/Notes`);
    return response.data || [];
  } catch (error) {
    console.error(`❌ Error obteniendo notas de ${module} ${recordId} de ZOHO:`, error);
    // Si no hay notas o el registro no existe, retornar array vacío
    return [];
  }
}

/**
 * Obtiene todas las notas de múltiples registros
 * @param module Nombre del módulo (Leads o Deals)
 * @param recordIds Array de IDs de registros para obtener sus notas
 */
export async function getZohoNotesForRecords(module: 'Leads' | 'Deals', recordIds: string[]): Promise<Map<string, ZohoNote[]>> {
  const notesMap = new Map<string, ZohoNote[]>();
  
  // Obtener notas en lotes para evitar demasiadas peticiones
  const batchSize = 10;
  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    
    // Obtener notas para cada registro del lote
    const notesPromises = batch.map(async (recordId) => {
      try {
        const notes = await getZohoNotes(module, recordId);
        return { recordId, notes };
      } catch (error) {
        console.error(`Error obteniendo notas para ${recordId}:`, error);
        return { recordId, notes: [] };
      }
    });
    
    const results = await Promise.all(notesPromises);
    results.forEach(({ recordId, notes }) => {
      notesMap.set(recordId, notes);
    });
    
    // Pequeño delay entre lotes para evitar rate limiting
    if (i + batchSize < recordIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return notesMap;
}

/**
 * Obtiene todos los leads de ZOHO CRM (sin paginación, todos los registros)
 * Útil para sincronización completa
 */
export async function getAllZohoLeads(): Promise<ZohoLead[]> {
  const allLeads: ZohoLead[] = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await getZohoLeads(currentPage, 200);
    if (response.data) {
      allLeads.push(...response.data);
    }
    hasMore = response.info?.more_records || false;
    currentPage++;
    
    // Limitar a 50 páginas (10,000 registros) para evitar demasiadas peticiones
    if (currentPage > 50) break;
  }

  return allLeads;
}

/**
 * Obtiene todos los deals de ZOHO CRM (sin paginación, todos los registros)
 * Útil para sincronización completa
 */
export async function getAllZohoDeals(): Promise<ZohoDeal[]> {
  const allDeals: ZohoDeal[] = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await getZohoDeals(currentPage, 200);
    if (response.data) {
      allDeals.push(...response.data);
    }
    hasMore = response.info?.more_records || false;
    currentPage++;
    
    // Limitar a 50 páginas (10,000 registros) para evitar demasiadas peticiones
    if (currentPage > 50) break;
  }

  return allDeals;
}

/**
 * Obtiene estadísticas generales de leads y deals
 * @param filters Filtros opcionales para las estadísticas
 * @param useLocal Si es true, usa la BD local primero (por defecto true)
 */
export async function getZohoStats(filters?: {
  desarrollo?: string;
  startDate?: Date;
  endDate?: Date;
}, useLocal: boolean = true): Promise<ZohoStats> {
  try {
    let allLeads: ZohoLead[] = [];
    let allDeals: ZohoDeal[] = [];

    // Intentar obtener desde BD local primero
    if (useLocal) {
      try {
        const { getZohoLeadsFromDB, getZohoDealsFromDB } = await import('@/lib/postgres');
        
        // Obtener todos los leads desde BD local
        const leadsData = await getZohoLeadsFromDB(1, 10000, filters);
        allLeads = leadsData.leads;

        // Obtener todos los deals desde BD local
        const dealsData = await getZohoDealsFromDB(1, 10000, filters);
        allDeals = dealsData.deals;

        // Si hay datos en BD local, usarlos
        if (allLeads.length > 0 || allDeals.length > 0) {
          console.log(`📊 Usando datos de BD local: ${allLeads.length} leads, ${allDeals.length} deals`);
        } else {
          // Si no hay datos locales, obtener desde Zoho
          useLocal = false;
        }
      } catch (error) {
        // Si falla la BD local, obtener desde Zoho
        console.warn('⚠️ Error obteniendo datos desde BD local, usando Zoho:', error);
        useLocal = false;
      }
    }

    // Variable para rastrear si los datos vienen de BD local (ya filtrados)
    const dataFromLocalDB = useLocal && (allLeads.length > 0 || allDeals.length > 0);

    // Si no se usa BD local o no hay datos, obtener desde Zoho
    if (!useLocal || (allLeads.length === 0 && allDeals.length === 0)) {
      // Obtener todos los leads (puede requerir múltiples páginas)
      allLeads = [];
      let currentPage = 1;
      let hasMore = true;

      while (hasMore) {
        const leadsResponse = await getZohoLeads(currentPage, 200);
        if (leadsResponse.data) {
          allLeads.push(...leadsResponse.data);
        }
        hasMore = leadsResponse.info?.more_records || false;
        currentPage++;
        
        // Limitar a 5 páginas para evitar demasiadas peticiones
        if (currentPage > 5) break;
      }

      // Obtener todos los deals (puede requerir múltiples páginas)
      allDeals = [];
      currentPage = 1;
      hasMore = true;

      while (hasMore) {
        const dealsResponse = await getZohoDeals(currentPage, 200);
        if (dealsResponse.data) {
          allDeals.push(...dealsResponse.data);
        }
        hasMore = dealsResponse.info?.more_records || false;
        currentPage++;
        
        // Limitar a 5 páginas para evitar demasiadas peticiones
        if (currentPage > 5) break;
      }
    }

    // Aplicar filtros solo si los datos vienen de Zoho (no de BD local)
    // Los datos de BD local ya vienen filtrados por la consulta SQL
    let filteredLeads = allLeads;
    let filteredDeals = allDeals;

    if (!dataFromLocalDB) {
      // Solo aplicar filtros en memoria si los datos vienen de Zoho
      // Filtrar por desarrollo si se especifica
      if (filters?.desarrollo) {
        filteredLeads = filteredLeads.filter(lead => 
          lead.Desarrollo === filters.desarrollo
        );
        filteredDeals = filteredDeals.filter(deal => 
          deal.Desarrollo === filters.desarrollo
        );
      }

      // Filtrar por rango de fechas si se especifica
      if (filters?.startDate || filters?.endDate) {
        const startDate = filters.startDate ? new Date(filters.startDate) : null;
        const endDate = filters.endDate ? new Date(filters.endDate) : null;

        filteredLeads = filteredLeads.filter(lead => {
          if (!lead.Created_Time) return false;
          const leadDate = new Date(lead.Created_Time);
          if (startDate && leadDate < startDate) return false;
          if (endDate && leadDate > endDate) return false;
          return true;
        });

        filteredDeals = filteredDeals.filter(deal => {
          if (!deal.Created_Time) return false;
          const dealDate = new Date(deal.Created_Time);
          if (startDate && dealDate < startDate) return false;
          if (endDate && dealDate > endDate) return false;
          return true;
        });
      }
    }

    // Calcular estadísticas
    const leadsByStatus: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const status = lead.Lead_Status || 'Sin Estado';
      leadsByStatus[status] = (leadsByStatus[status] || 0) + 1;
    });

    const dealsByStage: Record<string, number> = {};
    let totalDealValue = 0;
    filteredDeals.forEach(deal => {
      const stage = deal.Stage || 'Sin Etapa';
      dealsByStage[stage] = (dealsByStage[stage] || 0) + 1;
      if (deal.Amount) {
        totalDealValue += deal.Amount;
      }
    });

    // Estadísticas por desarrollo
    const leadsByDevelopment: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const desarrollo = lead.Desarrollo || 'Sin Desarrollo';
      leadsByDevelopment[desarrollo] = (leadsByDevelopment[desarrollo] || 0) + 1;
    });

    const dealsByDevelopment: Record<string, number> = {};
    const dealValueByDevelopment: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      const desarrollo = deal.Desarrollo || 'Sin Desarrollo';
      dealsByDevelopment[desarrollo] = (dealsByDevelopment[desarrollo] || 0) + 1;
      if (deal.Amount) {
        dealValueByDevelopment[desarrollo] = (dealValueByDevelopment[desarrollo] || 0) + deal.Amount;
      }
    });

    // Estadísticas por fecha (agrupadas por día)
    const leadsByDate: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      if (lead.Created_Time) {
        const date = new Date(lead.Created_Time).toISOString().split('T')[0];
        leadsByDate[date] = (leadsByDate[date] || 0) + 1;
      }
    });

    const dealsByDate: Record<string, number> = {};
    const dealValueByDate: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      if (deal.Created_Time) {
        const date = new Date(deal.Created_Time).toISOString().split('T')[0];
        dealsByDate[date] = (dealsByDate[date] || 0) + 1;
        if (deal.Amount) {
          dealValueByDate[date] = (dealValueByDate[date] || 0) + deal.Amount;
        }
      }
    });

    const averageDealValue = filteredDeals.length > 0 
      ? totalDealValue / filteredDeals.length 
      : 0;

    // Análisis de embudos (ordenados por cantidad descendente)
    const leadsFunnel: Record<string, number> = {};
    Object.entries(leadsByStatus)
      .sort(([, a], [, b]) => b - a)
      .forEach(([status, count]) => {
        leadsFunnel[status] = count;
      });

    const dealsFunnel: Record<string, number> = {};
    Object.entries(dealsByStage)
      .sort(([, a], [, b]) => b - a)
      .forEach(([stage, count]) => {
        dealsFunnel[stage] = count;
      });

    // Calcular tiempos promedio en fases
    const averageTimeInPhaseLeads: Record<string, { total: number; count: number }> = {};
    filteredLeads.forEach(lead => {
      const status = lead.Lead_Status || 'Sin Estado';
      let timeInPhase = 0;

      // Si tiene Tiempo_En_Fase, usarlo directamente
      if (lead.Tiempo_En_Fase) {
        timeInPhase = lead.Tiempo_En_Fase;
      } else if (lead.Created_Time && lead.Modified_Time) {
        // Calcular tiempo entre creación y modificación
        const created = new Date(lead.Created_Time);
        const modified = new Date(lead.Modified_Time);
        timeInPhase = Math.floor((modified.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)); // días
      }

      if (!averageTimeInPhaseLeads[status]) {
        averageTimeInPhaseLeads[status] = { total: 0, count: 0 };
      }
      if (timeInPhase > 0) {
        averageTimeInPhaseLeads[status].total += timeInPhase;
        averageTimeInPhaseLeads[status].count += 1;
      }
    });

    const averageTimeInPhaseDeals: Record<string, { total: number; count: number }> = {};
    filteredDeals.forEach(deal => {
      const stage = deal.Stage || 'Sin Etapa';
      let timeInPhase = 0;

      // Si tiene Tiempo_En_Fase, usarlo directamente
      if (deal.Tiempo_En_Fase) {
        timeInPhase = deal.Tiempo_En_Fase;
      } else if (deal.Created_Time && deal.Modified_Time) {
        // Calcular tiempo entre creación y modificación
        const created = new Date(deal.Created_Time);
        const modified = new Date(deal.Modified_Time);
        timeInPhase = Math.floor((modified.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)); // días
      }

      if (!averageTimeInPhaseDeals[stage]) {
        averageTimeInPhaseDeals[stage] = { total: 0, count: 0 };
      }
      if (timeInPhase > 0) {
        averageTimeInPhaseDeals[stage].total += timeInPhase;
        averageTimeInPhaseDeals[stage].count += 1;
      }
    });

    // Convertir a promedios
    const avgTimeLeads: Record<string, number> = {};
    Object.entries(averageTimeInPhaseLeads).forEach(([status, data]) => {
      avgTimeLeads[status] = data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0;
    });

    const avgTimeDeals: Record<string, number> = {};
    Object.entries(averageTimeInPhaseDeals).forEach(([stage, data]) => {
      avgTimeDeals[stage] = data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0;
    });

    // Motivos de descarte
    const leadsDiscardReasons: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      if (lead.Motivo_Descarte) {
        const motivo = lead.Motivo_Descarte;
        leadsDiscardReasons[motivo] = (leadsDiscardReasons[motivo] || 0) + 1;
      }
    });

    const dealsDiscardReasons: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      if (deal.Motivo_Descarte) {
        const motivo = deal.Motivo_Descarte;
        dealsDiscardReasons[motivo] = (dealsDiscardReasons[motivo] || 0) + 1;
      }
    });

    return {
      totalLeads: filteredLeads.length,
      totalDeals: filteredDeals.length,
      leadsByStatus,
      dealsByStage,
      totalDealValue,
      averageDealValue,
      leadsByDevelopment,
      dealsByDevelopment,
      dealValueByDevelopment,
      leadsByDate,
      dealsByDate,
      dealValueByDate,
      leadsFunnel,
      dealsFunnel,
      averageTimeInPhaseLeads: avgTimeLeads,
      averageTimeInPhaseDeals: avgTimeDeals,
      leadsDiscardReasons,
      dealsDiscardReasons,
    };
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de ZOHO:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas del mes anterior filtradas por desarrollo
 * @param desarrollo Desarrollo específico para filtrar (opcional)
 * @param useLocal Si es true, usa la BD local primero (por defecto true)
 */
export async function getZohoStatsLastMonth(desarrollo?: string, useLocal: boolean = true): Promise<ZohoStats> {
  // Calcular fechas del mes anterior
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  return getZohoStats({
    desarrollo,
    startDate: lastMonth,
    endDate: lastMonthEnd,
  }, useLocal);
}

/**
 * Verifica la conexión con ZOHO CRM
 */
export async function testZohoConnection(): Promise<boolean> {
  try {
    await getAccessToken();
    // Intentar obtener una página de leads para verificar la conexión
    await getZohoLeads(1, 1);
    return true;
  } catch (error) {
    console.error('❌ Error verificando conexión con ZOHO:', error);
    return false;
  }
}

