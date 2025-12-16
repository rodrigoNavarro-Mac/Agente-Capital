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
  Motivo_Descarte?: string; // Motivo de descarte del lead (también puede ser Raz_n_de_descarte)
  Tiempo_En_Fase?: number; // Tiempo en días en la fase actual
  Created_Time?: string; // También puede ser Creacion_de_Lead
  Modified_Time?: string;
  First_Contact_Time?: string; // Tiempo del primer contacto
  Ultimo_conctacto?: string; // Último contacto
  Tiempo_entre_primer_contacto?: number | string; // Tiempo entre creación y primer contacto
  Solicito_visita_cita?: boolean; // Si solicitó visita o cita
  Owner?: {
    id: string;
    name: string;
  };
  Notes?: ZohoNote[]; // Notas asociadas al lead
  [key: string]: any; // Para campos adicionales (incluye Creacion_de_Lead, Raz_n_de_descarte, etc.)
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
  // Nuevos KPIs
  conversionRate?: number; // % Conversión (Deals / Leads)
  averageTimeToFirstContact?: number; // Tiempo promedio a primer contacto (minutos)
  leadsOutsideBusinessHours?: number; // Cantidad de leads fuera de horario laboral
  leadsOutsideBusinessHoursPercentage?: number; // % Leads fuera de horario laboral
  discardedLeads?: number; // Cantidad de leads descartados
  discardedLeadsPercentage?: number; // % Leads descartados
  // Estadísticas por fuente
  leadsBySource?: Record<string, number>;
  dealsBySource?: Record<string, number>;
  conversionBySource?: Record<string, number>; // % conversión por fuente
  // Estadísticas por asesor
  leadsByOwner?: Record<string, number>;
  dealsByOwner?: Record<string, number>;
  averageTimeToFirstContactByOwner?: Record<string, number>; // Tiempo promedio a primer contacto por asesor (minutos)
  // Calidad de leads
  qualityLeads?: number; // Leads de calidad (contactados exitosamente con solicitud de cotización o visita)
  qualityLeadsPercentage?: number; // % Leads de calidad
  // Dependencia de canal
  channelConcentration?: Record<string, number>; // % concentración por canal
  // Evolución temporal (agrupada por semana/mes)
  leadsByWeek?: Record<string, number>;
  dealsByWeek?: Record<string, number>;
  leadsByMonth?: Record<string, number>;
  dealsByMonth?: Record<string, number>;
  conversionByDate?: Record<string, number>; // Conversión en el tiempo
  // Tiempos de contacto
  firstContactTimes?: Array<{ leadId: string; timeToContact: number; owner?: string; createdTime: string }>; // Tiempos de primer contacto
  // Actividades
  activitiesByType?: Record<string, number>; // Actividades por tipo (Call, Task)
  activitiesByOwner?: Record<string, number>; // Actividades por asesor
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
 * @param silent Si es true, no registra errores en la consola (útil para módulos opcionales)
 */
async function zohoRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  silent: boolean = false
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
    // Solo registrar error si no es modo silencioso
    if (!silent) {
      console.error(`❌ Error en petición a ZOHO CRM (${endpoint}):`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
    }
    throw new Error(`Error en ZOHO CRM: ${response.status} - ${errorText}`);
  }

  // Verificar si la respuesta tiene contenido antes de intentar parsear JSON
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');
  
  // Si no hay contenido o el content-length es 0, retornar objeto vacío
  if (contentLength === '0' || !contentType?.includes('application/json')) {
    const text = await response.text();
    if (!text || text.trim() === '') {
      // Respuesta vacía válida (ej: sin notas)
      return { data: [] } as T;
    }
    // Si hay texto pero no es JSON, intentar parsearlo
    try {
      return JSON.parse(text);
    } catch {
      // Si falla el parse, retornar objeto vacío
      return { data: [] } as T;
    }
  }

  // Intentar parsear JSON
  let data: any;
  try {
    const text = await response.text();
    if (!text || text.trim() === '') {
      // Respuesta vacía válida
      return { data: [] } as T;
    }
    data = JSON.parse(text);
  } catch {
    // Si falla el parse, puede ser una respuesta vacía válida
    if (!silent) {
      console.warn(`⚠️ Respuesta vacía o inválida de ZOHO CRM (${endpoint}), retornando datos vacíos`);
    }
    return { data: [] } as T;
  }
  
  // ZOHO puede retornar errores en el cuerpo de la respuesta
  if (data.data && data.data[0] && data.data[0].status === 'error') {
    if (!silent) {
      console.error(`❌ Error en respuesta de ZOHO CRM (${endpoint}):`, data.data[0].message);
    }
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
    // Usar modo silencioso para evitar logs innecesarios cuando no hay notas
    const response = await zohoRequest<{ data: ZohoNote[] }>(
      `/${module}/${recordId}/Notes`,
      {},
      true // silent = true para no loggear errores de registros sin notas
    );
    return response.data || [];
  } catch (error) {
    // Solo loggear errores reales (no respuestas vacías)
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Si es un error de JSON vacío o respuesta vacía, no loggear
    if (!errorMessage.includes('Unexpected end of JSON') && 
        !errorMessage.includes('JSON')) {
      console.error(`❌ Error obteniendo notas de ${module} ${recordId} de ZOHO:`, error);
    }
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

// =====================================================
// ACTIVIDADES (CALLS, TASKS)
// =====================================================

export interface ZohoActivity {
  id: string;
  Activity_Type?: string; // 'Call', 'Task'
  Subject?: string;
  Call_Type?: string;
  Call_Start_Time?: string;
  Call_Duration?: string;
  Task_Status?: string;
  Due_Date?: string;
  Created_Time?: string;
  Modified_Time?: string;
  Owner?: {
    id: string;
    name: string;
  };
  Who_Id?: {
    id: string;
    name: string;
  };
  What_Id?: {
    id: string;
    name: string;
  };
  [key: string]: any;
}

export interface ZohoActivitiesResponse {
  data: ZohoActivity[];
  info?: {
    count?: number;
    page?: number;
    per_page?: number;
    more_records?: boolean;
  };
}

/**
 * Obtiene actividades (Calls, Tasks) de ZOHO CRM
 * @param page Página a obtener (por defecto 1)
 * @param perPage Registros por página (máximo 200, por defecto 200)
 * @param activityType Tipo de actividad ('Calls', 'Tasks') o 'all' para todas
 */
export async function getZohoActivities(
  activityType: 'Calls' | 'Tasks' | 'all' = 'all',
  page: number = 1,
  perPage: number = 200
): Promise<ZohoActivitiesResponse> {
  try {
    if (activityType === 'all') {
      // Obtener todas las actividades combinadas
      const [calls, tasks] = await Promise.all([
        zohoRequest<ZohoActivitiesResponse>(`/Calls?page=${page}&per_page=${perPage}`, {}, false).catch(() => ({ data: [], info: {} })),
        zohoRequest<ZohoActivitiesResponse>(`/Tasks?page=${page}&per_page=${perPage}`, {}, false).catch(() => ({ data: [], info: {} })),
      ]);
      
      const allActivities: ZohoActivity[] = [
        ...(calls.data || []).map(a => ({ ...a, Activity_Type: 'Call' })),
        ...(tasks.data || []).map(a => ({ ...a, Activity_Type: 'Task' })),
      ];
      
      return {
        data: allActivities,
        info: {
          count: allActivities.length,
          page,
          per_page: perPage,
          more_records: false,
        },
      };
    } else {
      const response = await zohoRequest<ZohoActivitiesResponse>(
        `/${activityType}?page=${page}&per_page=${perPage}`, 
        {}, 
        false
      ).catch(() => ({ data: [], info: {} }));
      
      const activities = (response.data || []).map(a => ({ ...a, Activity_Type: activityType.slice(0, -1) }));
      return { ...response, data: activities };
    }
  } catch (error) {
    console.error(`❌ Error obteniendo actividades de ZOHO:`, error);
    // Retornar vacío en lugar de lanzar error para no romper el flujo
    return { data: [], info: {} };
  }
}

/**
 * Obtiene todas las actividades de ZOHO CRM (sin paginación)
 * Útil para análisis completo
 */
export async function getAllZohoActivities(activityType: 'Calls' | 'Tasks' | 'all' = 'all'): Promise<ZohoActivity[]> {
  const allActivities: ZohoActivity[] = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await getZohoActivities(activityType, currentPage, 200);
    if (response.data) {
      allActivities.push(...response.data);
    }
    hasMore = response.info?.more_records || false;
    currentPage++;
    
    // Limitar a 50 páginas (10,000 registros) para evitar demasiadas peticiones
    if (currentPage > 50) break;
  }

  return allActivities;
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

    // Variable para rastrear si los datos vienen de BD local (ya filtrados)
    let dataFromLocalDB = false;

    // Intentar obtener desde BD local primero
    if (useLocal) {
      try {
        const { getZohoLeadsFromDB, getZohoDealsFromDB } = await import('@/lib/postgres');
        
        // Obtener todos los leads desde BD local (sin paginación, todos los que cumplan filtros)
        // Hacer múltiples consultas si es necesario para obtener todos
        const allLeadsFromDB: ZohoLead[] = [];
        let currentPage = 1;
        const pageSize = 10000; // Obtener en lotes grandes
        
        while (true) {
          const leadsData = await getZohoLeadsFromDB(currentPage, pageSize, filters);
          if (leadsData.leads.length === 0) break;
          allLeadsFromDB.push(...leadsData.leads);
          // Si obtuvimos menos que el tamaño de página, ya no hay más
          if (leadsData.leads.length < pageSize) break;
          currentPage++;
          // Limitar a 10 páginas (100,000 registros) para evitar loops infinitos
          if (currentPage > 10) break;
        }
        allLeads = allLeadsFromDB;

        // Obtener todos los deals desde BD local (sin paginación, todos los que cumplan filtros)
        const allDealsFromDB: ZohoDeal[] = [];
        currentPage = 1;
        
        while (true) {
          const dealsData = await getZohoDealsFromDB(currentPage, pageSize, filters);
          if (dealsData.deals.length === 0) break;
          allDealsFromDB.push(...dealsData.deals);
          // Si obtuvimos menos que el tamaño de página, ya no hay más
          if (dealsData.deals.length < pageSize) break;
          currentPage++;
          // Limitar a 10 páginas (100,000 registros) para evitar loops infinitos
          if (currentPage > 10) break;
        }
        allDeals = allDealsFromDB;

        // Si hay datos en BD local, marcarlos como provenientes de BD local
        if (allLeads.length > 0 || allDeals.length > 0) {
          dataFromLocalDB = true;
          console.log(`📊 Usando datos de BD local: ${allLeads.length} leads, ${allDeals.length} deals`);
          // NO sincronizar si ya hay datos en BD local - continuar con el procesamiento normal
        } else {
          // Si no hay datos locales, limpiar arrays y obtener desde Zoho
          allLeads = [];
          allDeals = [];
          console.log('📊 BD local vacía, obteniendo datos desde Zoho...');
        }
      } catch (error) {
        // Si falla la BD local, obtener desde Zoho
        console.warn('⚠️ Error obteniendo datos desde BD local, usando Zoho:', error);
        allLeads = [];
        allDeals = [];
      }
    }

    // Si no hay datos de BD local, obtener desde Zoho y sincronizar automáticamente
    if (!dataFromLocalDB) {
      console.log('📊 BD local vacía o no disponible. Obteniendo datos desde Zoho y sincronizando...');
      
      try {
        // Usar las funciones completas que obtienen todos los registros
        allLeads = await getAllZohoLeads();
        console.log(`📊 Obtenidos ${allLeads.length} leads desde Zoho`);

        allDeals = await getAllZohoDeals();
        console.log(`📊 Obtenidos ${allDeals.length} deals desde Zoho`);

        // Sincronizar automáticamente a la BD local si useLocal es true
        if (useLocal && (allLeads.length > 0 || allDeals.length > 0)) {
          console.log('💾 Iniciando sincronización automática a la BD local...');
          try {
            const { syncZohoLead, syncZohoDeal } = await import('@/lib/postgres');
            
            // Sincronizar leads
            let leadsSynced = 0;
            let leadsCreated = 0;
            let leadsUpdated = 0;
            let leadsSkipped = 0; // Registros que no necesitan actualización
            let leadsFailed = 0;
            
            console.log(`🔄 Sincronizando ${allLeads.length} leads...`);
            const totalLeads = allLeads.length;
            for (let i = 0; i < allLeads.length; i++) {
              const lead = allLeads[i];
              try {
                const result = await syncZohoLead(lead);
                if (result === null) {
                  // No necesita actualización
                  leadsSkipped++;
                } else {
                  leadsSynced++;
                  if (result === true) {
                    leadsCreated++;
                  } else {
                    leadsUpdated++;
                  }
                }
                
                // Mostrar progreso cada 50 leads
                if ((i + 1) % 50 === 0 || (i + 1) === totalLeads) {
                  console.log(`📊 Progreso leads: ${i + 1}/${totalLeads} (${Math.round(((i + 1) / totalLeads) * 100)}%)`);
                }
              } catch (error) {
                leadsFailed++;
                console.warn(`⚠️ Error sincronizando lead ${lead.id}:`, error);
              }
            }
            console.log(`✅ Leads sincronizados: ${leadsSynced} total (${leadsCreated} nuevos, ${leadsUpdated} actualizados, ${leadsSkipped} sin cambios, ${leadsFailed} fallidos)`);

            // Sincronizar deals
            let dealsSynced = 0;
            let dealsCreated = 0;
            let dealsUpdated = 0;
            let dealsSkipped = 0; // Registros que no necesitan actualización
            let dealsFailed = 0;
            
            console.log(`🔄 Sincronizando ${allDeals.length} deals...`);
            const totalDeals = allDeals.length;
            for (let i = 0; i < allDeals.length; i++) {
              const deal = allDeals[i];
              try {
                const result = await syncZohoDeal(deal);
                if (result === null) {
                  // No necesita actualización
                  dealsSkipped++;
                } else {
                  dealsSynced++;
                  if (result === true) {
                    dealsCreated++;
                  } else {
                    dealsUpdated++;
                  }
                }
                
                // Mostrar progreso cada 10 deals o al final
                if ((i + 1) % 10 === 0 || (i + 1) === totalDeals) {
                  console.log(`📊 Progreso deals: ${i + 1}/${totalDeals} (${Math.round(((i + 1) / totalDeals) * 100)}%)`);
                }
              } catch (error) {
                dealsFailed++;
                console.warn(`⚠️ Error sincronizando deal ${deal.id}:`, error);
              }
            }
            console.log(`✅ Deals sincronizados: ${dealsSynced} total (${dealsCreated} nuevos, ${dealsUpdated} actualizados, ${dealsSkipped} sin cambios, ${dealsFailed} fallidos)`);
            
            console.log(`🎉 Sincronización automática completada: ${leadsSynced + dealsSynced} registros sincronizados`);
          } catch (error) {
            console.error('❌ Error crítico sincronizando datos a BD local:', error);
            // No fallar la función si la sincronización falla, solo continuar con los datos obtenidos
          }
        }
      } catch (error) {
        console.error('❌ Error obteniendo datos desde Zoho:', error);
        throw error; // Re-lanzar el error para que se maneje arriba
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
        const leadsBefore = filteredLeads.length;
        const dealsBefore = filteredDeals.length;
        
        filteredLeads = filteredLeads.filter(lead => 
          lead.Desarrollo === filters.desarrollo
        );
        filteredDeals = filteredDeals.filter(deal => {
          // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
          const dealDesarrollo = deal.Desarrollo || (deal as any).Desarollo;
          return dealDesarrollo === filters.desarrollo;
        });
        
        console.log(`🔍 Filtro desarrollo "${filters.desarrollo}": ${leadsBefore} → ${filteredLeads.length} leads, ${dealsBefore} → ${filteredDeals.length} deals`);
      }

      // Filtrar por rango de fechas si se especifica
      if (filters?.startDate || filters?.endDate) {
        const startDate = filters.startDate ? new Date(filters.startDate) : null;
        const endDate = filters.endDate ? new Date(filters.endDate) : null;
        
        const leadsBefore = filteredLeads.length;
        const dealsBefore = filteredDeals.length;

        filteredLeads = filteredLeads.filter(lead => {
          const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
          if (!createdTime) return false;
          const leadDate = new Date(createdTime);
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
        
        console.log(`🔍 Filtro fechas (${startDate?.toISOString()} - ${endDate?.toISOString()}): ${leadsBefore} → ${filteredLeads.length} leads, ${dealsBefore} → ${filteredDeals.length} deals`);
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
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      const desarrollo = lead.Desarrollo || (lead as any).Desarollo || 'Sin Desarrollo';
      leadsByDevelopment[desarrollo] = (leadsByDevelopment[desarrollo] || 0) + 1;
    });

    const dealsByDevelopment: Record<string, number> = {};
    const dealValueByDevelopment: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      const desarrollo = deal.Desarrollo || (deal as any).Desarollo || 'Sin Desarrollo';
      dealsByDevelopment[desarrollo] = (dealsByDevelopment[desarrollo] || 0) + 1;
      if (deal.Amount) {
        dealValueByDevelopment[desarrollo] = (dealValueByDevelopment[desarrollo] || 0) + deal.Amount;
      }
    });

    // Estadísticas por fecha (agrupadas por día)
    // Usar Creacion_de_Lead si existe, sino Created_Time
    const leadsByDate: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (createdTime) {
        const date = new Date(createdTime).toISOString().split('T')[0];
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
      } else {
        // Usar Creacion_de_Lead si existe, sino Created_Time
        const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
        if (createdTime && lead.Modified_Time) {
          // Calcular tiempo entre creación y modificación
          const created = new Date(createdTime);
          const modified = new Date(lead.Modified_Time);
          timeInPhase = Math.floor((modified.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)); // días
        }
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
    // Usar Raz_n_de_descarte si existe, sino Motivo_Descarte
    const leadsDiscardReasons: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const motivo = (lead as any).Raz_n_de_descarte || lead.Motivo_Descarte;
      if (motivo) {
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

    // =====================================================
    // NUEVOS KPIs Y MÉTRICAS
    // =====================================================

    // 1. % Conversión (Deals / Leads)
    const conversionRate = filteredLeads.length > 0 
      ? Math.round((filteredDeals.length / filteredLeads.length) * 10000) / 100 
      : 0;

    // 2. Leads descartados
    const discardedLeads = Object.values(leadsDiscardReasons).reduce((sum, count) => sum + count, 0);
    const discardedLeadsPercentage = filteredLeads.length > 0
      ? Math.round((discardedLeads / filteredLeads.length) * 10000) / 100
      : 0;

    // 3. Estadísticas por fuente
    const leadsBySource: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const source = lead.Lead_Source || 'Sin Fuente';
      leadsBySource[source] = (leadsBySource[source] || 0) + 1;
    });

    const dealsBySource: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      const source = deal.Lead_Source || 'Sin Fuente';
      dealsBySource[source] = (dealsBySource[source] || 0) + 1;
    });

    // Conversión por fuente
    const conversionBySource: Record<string, number> = {};
    Object.keys(leadsBySource).forEach(source => {
      const leads = leadsBySource[source];
      const deals = dealsBySource[source] || 0;
      conversionBySource[source] = leads > 0 
        ? Math.round((deals / leads) * 10000) / 100 
        : 0;
    });

    // Dependencia de canal (% concentración)
    const channelConcentration: Record<string, number> = {};
    const totalLeadsWithSource = Object.values(leadsBySource).reduce((sum, count) => sum + count, 0);
    Object.entries(leadsBySource).forEach(([source, count]) => {
      channelConcentration[source] = totalLeadsWithSource > 0
        ? Math.round((count / totalLeadsWithSource) * 10000) / 100
        : 0;
    });

    // 4. Estadísticas por asesor (Owner)
    const leadsByOwner: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const owner = lead.Owner?.name || 'Sin Asesor';
      leadsByOwner[owner] = (leadsByOwner[owner] || 0) + 1;
    });

    const dealsByOwner: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      const owner = deal.Owner?.name || 'Sin Asesor';
      dealsByOwner[owner] = (dealsByOwner[owner] || 0) + 1;
    });

    // 5. Tiempo promedio a primer contacto
    // Intentar obtener actividades para calcular tiempos de primer contacto
    const firstContactTimes: Array<{ leadId: string; timeToContact: number; owner?: string; createdTime: string }> = [];
    let averageTimeToFirstContact = 0;
    const averageTimeToFirstContactByOwner: Record<string, number> = {};

    try {
      // Obtener actividades relacionadas con leads
      const activities = await getAllZohoActivities('all').catch(() => []);
      
      // Crear mapa de actividades por lead (Who_Id)
      const activitiesByLead = new Map<string, ZohoActivity[]>();
      activities.forEach(activity => {
        if (activity.Who_Id?.id) {
          const leadId = activity.Who_Id.id;
          if (!activitiesByLead.has(leadId)) {
            activitiesByLead.set(leadId, []);
          }
          activitiesByLead.get(leadId)!.push(activity);
        }
      });

      // Calcular tiempo a primer contacto para cada lead
      const contactTimesByOwner: Record<string, number[]> = {};
      
      filteredLeads.forEach(lead => {
        // Usar Creacion_de_Lead si existe, sino Created_Time
        const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
        if (!createdTime) return;
        
        // También verificar si ya tiene First_Contact_Time o Tiempo_entre_primer_contacto
        const firstContactTime = (lead as any).First_Contact_Time || (lead as any).Ultimo_conctacto;
        const tiempoEntreContacto = (lead as any).Tiempo_entre_primer_contacto;
        
        // Si ya tiene el tiempo calculado, usarlo directamente
        if (tiempoEntreContacto !== null && tiempoEntreContacto !== undefined) {
          const timeDiffMinutes = typeof tiempoEntreContacto === 'number' 
            ? tiempoEntreContacto 
            : parseFloat(tiempoEntreContacto) || 0;
          
          if (timeDiffMinutes >= 0) {
            firstContactTimes.push({
              leadId: lead.id,
              timeToContact: timeDiffMinutes,
              owner: lead.Owner?.name,
              createdTime: createdTime,
            });

            const owner = lead.Owner?.name || 'Sin Asesor';
            if (!contactTimesByOwner[owner]) {
              contactTimesByOwner[owner] = [];
            }
            contactTimesByOwner[owner].push(timeDiffMinutes);
          }
        } else if (firstContactTime) {
          // Si tiene First_Contact_Time, calcular la diferencia
          const leadCreated = new Date(createdTime);
          const firstContact = new Date(firstContactTime);
          const timeDiffMinutes = Math.floor((firstContact.getTime() - leadCreated.getTime()) / (1000 * 60));
          
          if (timeDiffMinutes >= 0) {
            firstContactTimes.push({
              leadId: lead.id,
              timeToContact: timeDiffMinutes,
              owner: lead.Owner?.name,
              createdTime: createdTime,
            });

            const owner = lead.Owner?.name || 'Sin Asesor';
            if (!contactTimesByOwner[owner]) {
              contactTimesByOwner[owner] = [];
            }
            contactTimesByOwner[owner].push(timeDiffMinutes);
          }
        } else {
          // Intentar obtener de actividades
          const leadActivities = activitiesByLead.get(lead.id) || [];
          if (leadActivities.length === 0) return;

          const firstActivity = leadActivities
            .filter(a => a.Created_Time)
            .sort((a, b) => {
              const timeA = new Date(a.Created_Time!).getTime();
              const timeB = new Date(b.Created_Time!).getTime();
              return timeA - timeB;
            })[0];

          if (firstActivity && firstActivity.Created_Time) {
            const leadCreated = new Date(createdTime);
            const firstContact = new Date(firstActivity.Created_Time);
            const timeDiffMinutes = Math.floor((firstContact.getTime() - leadCreated.getTime()) / (1000 * 60));
            
            if (timeDiffMinutes >= 0) {
              firstContactTimes.push({
                leadId: lead.id,
                timeToContact: timeDiffMinutes,
                owner: lead.Owner?.name,
                createdTime: createdTime,
              });

              const owner = lead.Owner?.name || 'Sin Asesor';
              if (!contactTimesByOwner[owner]) {
                contactTimesByOwner[owner] = [];
              }
              contactTimesByOwner[owner].push(timeDiffMinutes);
            }
          }
        }
      });

      // Calcular promedio general
      if (firstContactTimes.length > 0) {
        const totalMinutes = firstContactTimes.reduce((sum, item) => sum + item.timeToContact, 0);
        averageTimeToFirstContact = Math.round((totalMinutes / firstContactTimes.length) * 10) / 10;
      }

      // Calcular promedio por asesor
      Object.entries(contactTimesByOwner).forEach(([owner, times]) => {
        if (times.length > 0) {
          const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
          averageTimeToFirstContactByOwner[owner] = Math.round(avg * 10) / 10;
        }
      });
    } catch (error) {
      console.warn('⚠️ Error calculando tiempos de primer contacto:', error);
    }

    // 6. Leads fuera de horario laboral (08:30-20:30)
    let leadsOutsideBusinessHours = 0;
    filteredLeads.forEach(lead => {
      // Usar Creacion_de_Lead si existe, sino Created_Time
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (!createdTime) return;
      const createdDate = new Date(createdTime);
      const hour = createdDate.getHours();
      const minute = createdDate.getMinutes();
      const timeInMinutes = hour * 60 + minute;
      const businessStart = 8 * 60 + 30; // 08:30
      const businessEnd = 20 * 60 + 30; // 20:30
      
      // Verificar si es fin de semana
      const dayOfWeek = createdDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      if (isWeekend || timeInMinutes < businessStart || timeInMinutes > businessEnd) {
        leadsOutsideBusinessHours++;
      }
    });

    const leadsOutsideBusinessHoursPercentage = filteredLeads.length > 0
      ? Math.round((leadsOutsideBusinessHours / filteredLeads.length) * 10000) / 100
      : 0;

    // 7. Calidad de leads (contactados exitosamente con solicitud de cotización o visita)
    // Un lead de calidad es uno que:
    // - Ha sido contactado (tiene actividades)
    // - Tiene un deal creado O tiene estado que indique interés (ej: "Contactado", "Cotización", "Visita")
    let qualityLeads = 0;
    try {
      const activities = await getAllZohoActivities('all').catch(() => []);
      const leadsWithActivities = new Set<string>();
      activities.forEach(activity => {
        if (activity.Who_Id?.id) {
          leadsWithActivities.add(activity.Who_Id.id);
        }
      });

      filteredLeads.forEach(lead => {
        const hasFirstContact = !!(lead as any).First_Contact_Time || !!(lead as any).Ultimo_conctacto;
        const hasActivities = leadsWithActivities.has(lead.id);
        const solicitoVisita = (lead as any).Solicito_visita_cita === true;
        // Verificar si hay un deal relacionado con el lead por email o nombre
        const hasDeal = filteredDeals.some(deal => {
          // Intentar relacionar por email si está disponible
          if (lead.Email && deal.Account_Name?.name) {
            return deal.Account_Name.name.toLowerCase().includes(lead.Email.toLowerCase()) ||
                   lead.Email.toLowerCase().includes(deal.Account_Name.name.toLowerCase());
          }
          // Intentar relacionar por nombre si está disponible
          if (lead.Full_Name && deal.Account_Name?.name) {
            return deal.Account_Name.name.toLowerCase().includes(lead.Full_Name.toLowerCase()) ||
                   lead.Full_Name.toLowerCase().includes(deal.Account_Name.name.toLowerCase());
          }
          // Si tienen la misma fuente, podría ser una relación indirecta
          if (lead.Lead_Source && deal.Lead_Source && lead.Lead_Source === deal.Lead_Source) {
            // Solo considerar si el deal está en una etapa avanzada
            const advancedStages = ['Negociación', 'Propuesta', 'Cierre', 'Ganado'];
            return advancedStages.some(stage => 
              deal.Stage?.toLowerCase().includes(stage.toLowerCase())
            );
          }
          return false;
        });
        const statusIndicatesInterest = lead.Lead_Status && 
          ['Contactado', 'Cotización', 'Visita', 'Interesado', 'Calificado', 'Agendo cita'].some(
            status => lead.Lead_Status!.toLowerCase().includes(status.toLowerCase())
          );

        // Lead de calidad si:
        // - Ha sido contactado (tiene First_Contact_Time o actividades) Y
        // - (Solicitó visita/cita O tiene estado de interés O tiene deal relacionado)
        if ((hasFirstContact || hasActivities) && (solicitoVisita || statusIndicatesInterest || hasDeal)) {
          qualityLeads++;
        }
      });
    } catch (error) {
      console.warn('⚠️ Error calculando leads de calidad:', error);
    }

    const qualityLeadsPercentage = filteredLeads.length > 0
      ? Math.round((qualityLeads / filteredLeads.length) * 10000) / 100
      : 0;

    // 8. Evolución temporal (agrupada por semana y mes)
    const leadsByWeek: Record<string, number> = {};
    const dealsByWeek: Record<string, number> = {};
    const leadsByMonth: Record<string, number> = {};
    const dealsByMonth: Record<string, number> = {};
    const conversionByDate: Record<string, number> = {};

    // Función helper para obtener semana del año
    const getWeekKey = (date: Date): string => {
      const year = date.getFullYear();
      const oneJan = new Date(year, 0, 1);
      const numberOfDays = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
      const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
      return `${year}-W${week.toString().padStart(2, '0')}`;
    };

    // Función helper para obtener mes
    const getMonthKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      return `${year}-${month}`;
    };

    filteredLeads.forEach(lead => {
      // Usar Creacion_de_Lead si existe, sino Created_Time
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (createdTime) {
        const date = new Date(createdTime);
        const weekKey = getWeekKey(date);
        const monthKey = getMonthKey(date);
        leadsByWeek[weekKey] = (leadsByWeek[weekKey] || 0) + 1;
        leadsByMonth[monthKey] = (leadsByMonth[monthKey] || 0) + 1;
      }
    });

    filteredDeals.forEach(deal => {
      if (deal.Created_Time) {
        const date = new Date(deal.Created_Time);
        const weekKey = getWeekKey(date);
        const monthKey = getMonthKey(date);
        dealsByWeek[weekKey] = (dealsByWeek[weekKey] || 0) + 1;
        dealsByMonth[monthKey] = (dealsByMonth[monthKey] || 0) + 1;
      }
    });

    // Conversión por fecha (diaria)
    Object.keys(leadsByDate).forEach(date => {
      const leads = leadsByDate[date];
      const deals = dealsByDate[date] || 0;
      conversionByDate[date] = leads > 0 
        ? Math.round((deals / leads) * 10000) / 100 
        : 0;
    });

    // 9. Actividades
    const activitiesByType: Record<string, number> = {};
    const activitiesByOwner: Record<string, number> = {};
    
    try {
      const activities = await getAllZohoActivities('all').catch(() => []);
      activities.forEach(activity => {
        const type = activity.Activity_Type || 'Unknown';
        activitiesByType[type] = (activitiesByType[type] || 0) + 1;
        
        const owner = activity.Owner?.name || 'Sin Asesor';
        activitiesByOwner[owner] = (activitiesByOwner[owner] || 0) + 1;
      });
    } catch (error) {
      console.warn('⚠️ Error obteniendo actividades:', error);
    }

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
      // Nuevos KPIs
      conversionRate,
      averageTimeToFirstContact,
      leadsOutsideBusinessHours,
      leadsOutsideBusinessHoursPercentage,
      discardedLeads,
      discardedLeadsPercentage,
      leadsBySource,
      dealsBySource,
      conversionBySource,
      channelConcentration,
      leadsByOwner,
      dealsByOwner,
      averageTimeToFirstContactByOwner,
      qualityLeads,
      qualityLeadsPercentage,
      leadsByWeek,
      dealsByWeek,
      leadsByMonth,
      dealsByMonth,
      conversionByDate,
      firstContactTimes,
      activitiesByType,
      activitiesByOwner,
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

