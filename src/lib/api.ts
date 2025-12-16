/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - API CLIENT
 * =====================================================
 * Cliente para interactuar con el backend
 */

import type {
  UploadResponse,
  RAGQueryRequest,
  RAGQueryResponse,
  AgentSettings,
  DevelopmentsByZone,
  DocumentMetadata,
  QueryLog,
  User,
  UserDevelopment,
  Zone,
  Role,
} from '@/types/documents';

// =====================================================
// BASE FETCH HELPER
// =====================================================

async function fetcher<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// =====================================================
// UPLOAD API
// =====================================================

export async function uploadDocument(formData: FormData): Promise<UploadResponse> {
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(error.error || 'Error al subir documento');
  }

  return response.json();
}

// =====================================================
// RAG QUERY API
// =====================================================

export async function queryAgent(data: RAGQueryRequest): Promise<RAGQueryResponse> {
  // Obtener token de autenticación
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  return fetcher<RAGQueryResponse>('/api/rag-query', {
    method: 'POST',
    headers: token ? {
      'Authorization': `Bearer ${token}`,
    } : undefined,
    body: JSON.stringify(data),
  });
}

// =====================================================
// DEVELOPMENTS API
// =====================================================

export async function getDevelopments(): Promise<DevelopmentsByZone> {
  const response = await fetcher<{ success: boolean; data: DevelopmentsByZone }>(
    '/api/developments'
  );
  return response.data;
}

// =====================================================
// AGENT CONFIG API
// =====================================================

export async function getAgentConfig(): Promise<AgentSettings> {
  const response = await fetcher<{ success: boolean; data: AgentSettings }>(
    '/api/agent-config'
  );
  return response.data;
}

export async function updateAgentConfig(
  key: string,
  value: string | number,
  updatedBy: number
): Promise<void> {
  await fetcher('/api/agent-config', {
    method: 'POST',
    body: JSON.stringify({ key, value: String(value), updated_by: updatedBy }),
  });
}

export async function updateMultipleConfig(
  configs: Array<{ key: string; value: string | number }>,
  updatedBy: number
): Promise<void> {
  await fetcher('/api/agent-config', {
    method: 'PUT',
    body: JSON.stringify({ configs, updated_by: updatedBy }),
  });
}

// =====================================================
// DOCUMENTS API
// =====================================================

export interface GetDocumentsParams {
  zone?: string;
  development?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export async function getDocuments(params?: GetDocumentsParams, invalidateCache?: boolean): Promise<DocumentMetadata[]> {
  const queryParams = new URLSearchParams();
  
  if (params?.zone) queryParams.append('zone', params.zone);
  if (params?.development) queryParams.append('development', params.development);
  if (params?.type) queryParams.append('type', params.type);
  if (params?.limit) queryParams.append('limit', String(params.limit));
  if (params?.offset) queryParams.append('offset', String(params.offset));
  
  // Agregar parámetro para invalidar caché si se solicita
  if (invalidateCache) {
    queryParams.append('invalidate', 'true');
  }

  const url = `/api/documents${queryParams.toString() ? `?${queryParams}` : ''}`;
  const response = await fetcher<{ success: boolean; data: DocumentMetadata[] }>(url);
  
  return response.data;
}

export async function deleteDocument(id: number, userId: number): Promise<void> {
  await fetcher(`/api/documents/${id}?userId=${userId}`, {
    method: 'DELETE',
  });
}

export interface DocumentChunksResponse {
  chunks: import('@/types/documents').PineconeMatch[];
  documentText: string;
}

export async function getDocumentChunks(id: number, userId: number): Promise<DocumentChunksResponse> {
  const response = await fetcher<{ success: boolean; data: DocumentChunksResponse }>(
    `/api/documents/${id}/chunks?userId=${userId}`
  );
  
  if (!response.success || !response.data) {
    throw new Error('Error obteniendo chunks del documento');
  }
  
  return response.data;
}

// =====================================================
// QUERY LOGS API
// =====================================================

export interface GetLogsParams {
  userId?: number;
  zone?: string;
  actionType?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}

export interface LogsResponse {
  queries: QueryLog[];
  actions: import('@/types/documents').ActionLog[];
}

export async function getQueryLogs(params?: GetLogsParams): Promise<LogsResponse> {
  const queryParams = new URLSearchParams();
  
  if (params?.userId) queryParams.append('userId', String(params.userId));
  if (params?.zone) queryParams.append('zone', params.zone);
  if (params?.actionType) queryParams.append('actionType', params.actionType);
  if (params?.resourceType) queryParams.append('resourceType', params.resourceType);
  if (params?.limit) queryParams.append('limit', String(params.limit));
  if (params?.offset) queryParams.append('offset', String(params.offset));

  const url = `/api/logs${queryParams.toString() ? `?${queryParams}` : ''}`;
  
  // Obtener token de autenticación
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: LogsResponse }>(url, {
    headers: token ? {
      'Authorization': `Bearer ${token}`,
    } : undefined,
  });
  
  if (!response.success || !response.data) {
    console.error('[API] Respuesta inválida');
    throw new Error('Error obteniendo logs: respuesta inválida del servidor');
  }
  
  return response.data;
}

// =====================================================
// CHAT HISTORY API
// =====================================================

export interface GetChatHistoryParams {
  userId: number;
  zone?: string;
  development?: string;
  limit?: number;
  offset?: number;
}

export async function getChatHistory(params: GetChatHistoryParams): Promise<QueryLog[]> {
  const queryParams = new URLSearchParams();
  
  // Obtener token de autenticación para verificar si el usuario es admin
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  // Solo enviar userId si el usuario es admin (el backend lo ignorará para usuarios normales)
  // Para usuarios normales, el backend usará el userId del token
  if (params.userId) {
    queryParams.append('userId', String(params.userId));
  }
  if (params.zone) queryParams.append('zone', params.zone);
  if (params.development) queryParams.append('development', params.development);
  if (params.limit) queryParams.append('limit', String(params.limit));
  if (params.offset) queryParams.append('offset', String(params.offset));

  const url = `/api/chat-history?${queryParams.toString()}`;
  
  const response = await fetcher<{ success: boolean; data: QueryLog[] }>(url, {
    headers: token ? {
      'Authorization': `Bearer ${token}`,
    } : undefined,
  });
  
  return response.data;
}

export interface DeleteChatHistoryParams {
  userId: number;
  zone?: string;
  development?: string;
}

export async function deleteChatHistory(params: DeleteChatHistoryParams): Promise<{ deletedCount: number }> {
  const queryParams = new URLSearchParams();
  
  queryParams.append('userId', String(params.userId));
  if (params.zone) queryParams.append('zone', params.zone);
  if (params.development) queryParams.append('development', params.development);

  const url = `/api/chat-history?${queryParams.toString()}`;
  
  // Obtener token de autenticación
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: { deletedCount: number }; message?: string }>(url, {
    method: 'DELETE',
    headers: token ? {
      'Authorization': `Bearer ${token}`,
    } : undefined,
  });
  
  return response.data;
}

// =====================================================
// USER API
// =====================================================

export async function getUser(userId: number): Promise<User> {
  const response = await fetcher<{ success: boolean; data: User }>(
    `/api/user?userId=${userId}`
  );
  return response.data;
}

export async function getAllUsers(): Promise<User[]> {
  const response = await fetcher<{ success: boolean; data: User[] }>('/api/users');
  return response.data;
}

export interface CreateUserParams {
  email: string;
  name: string;
  role_id: number;
  password?: string;
}

export async function createUser(params: CreateUserParams): Promise<User> {
  const response = await fetcher<{ success: boolean; data: User }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return response.data;
}

export interface UpdateUserParams {
  email?: string;
  name?: string;
  role_id?: number;
  is_active?: boolean;
}

export async function updateUser(userId: number, params: UpdateUserParams): Promise<User> {
  const response = await fetcher<{ success: boolean; data: User }>(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });
  return response.data;
}

export async function deleteUser(userId: number): Promise<void> {
  await fetcher(`/api/users/${userId}`, {
    method: 'DELETE',
  });
}

// =====================================================
// USER DEVELOPMENTS API
// =====================================================

export async function getUserDevelopments(userId: number): Promise<UserDevelopment[]> {
  const response = await fetcher<{ success: boolean; data: UserDevelopment[] }>(
    `/api/users/${userId}/developments`
  );
  return response.data;
}

export interface AssignUserDevelopmentParams {
  zone: Zone;
  development: string;
  can_upload?: boolean;
  can_query?: boolean;
}

export async function assignUserDevelopment(
  userId: number,
  params: AssignUserDevelopmentParams
): Promise<UserDevelopment> {
  const response = await fetcher<{ success: boolean; data: UserDevelopment }>(
    `/api/users/${userId}/developments`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
  return response.data;
}

export interface UpdateUserDevelopmentParams {
  zone: Zone;
  development: string;
  can_upload: boolean;
  can_query: boolean;
}

export async function updateUserDevelopment(
  userId: number,
  params: UpdateUserDevelopmentParams
): Promise<UserDevelopment> {
  const response = await fetcher<{ success: boolean; data: UserDevelopment }>(
    `/api/users/${userId}/developments`,
    {
      method: 'PUT',
      body: JSON.stringify(params),
    }
  );
  return response.data;
}

export async function removeUserDevelopment(
  userId: number,
  zone: Zone,
  development: string
): Promise<void> {
  await fetcher(`/api/users/${userId}/developments?zone=${zone}&development=${development}`, {
    method: 'DELETE',
  });
}

// =====================================================
// ROLES API
// =====================================================

export async function getRoles(): Promise<Role[]> {
  const response = await fetcher<{ success: boolean; data: Role[] }>('/api/roles');
  return response.data;
}

// =====================================================
// AUTH API
// =====================================================

export interface LoginResponse {
  user: {
    id: number;
    email: string;
    name: string;
    role?: string;
  };
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetcher<{ success: boolean; data: LoginResponse }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return response.data;
}

export async function logout(token: string): Promise<void> {
  await fetcher('/api/auth/logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await fetcher<{ success: boolean; data: { message: string } }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return response.data;
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  const response = await fetcher<{ success: boolean; data: { message: string } }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  return response.data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  token: string
): Promise<{ message: string }> {
  const response = await fetcher<{ success: boolean; data: { message: string } }>('/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return response.data;
}

export async function refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
  const response = await fetcher<{ success: boolean; data: { accessToken: string } }>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  return response.data;
}

export async function changeUserPassword(
  userId: number,
  password: string,
  token: string
): Promise<{ message: string }> {
  const response = await fetcher<{ success: boolean; data: { message: string } }>(`/api/users/${userId}/change-password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
  return response.data;
}

// =====================================================
// FEEDBACK API
// =====================================================

export interface FeedbackRequest {
  query_log_id: number;
  rating: number; // 1 a 5
  comment?: string | null;
}

export interface FeedbackResponse {
  success: boolean;
  message: string;
  feedback_id?: number;
}

export async function sendFeedback(
  feedback: FeedbackRequest,
  token: string
): Promise<FeedbackResponse> {
  const response = await fetcher<FeedbackResponse>('/api/rag-feedback', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(feedback),
  });
  return response;
}

// =====================================================
// STATS API
// =====================================================

export interface DashboardStats {
  totalDocuments: number;
  totalQueriesThisMonth: number;
  averageResponseTime: number;
  averageRating: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await fetcher<{ success: boolean; data: DashboardStats }>('/api/stats');
  return response.data;
}

// =====================================================
// HEALTH CHECK
// =====================================================

export async function checkHealth(): Promise<{ 
  lmStudio: string;
  openai?: string;
  current?: string;
}> {
  const response = await fetcher<{ 
    health: { 
      lmStudio: string;
      openai?: string;
      current?: string;
    } 
  }>('/api/rag-query');
  return response.health;
}

// =====================================================
// ZOHO CRM API
// =====================================================

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
  [key: string]: any;
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
  [key: string]: any;
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
  lifecycleFunnel?: { // Embudo del ciclo de vida
    leads: number; // Total de leads
    dealsWithAppointment: number; // Deals que agendaron cita (deals activos)
    closedWon: number; // Deals cerrados ganados
  };
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
// ZOHO NOTES AI INSIGHTS
// =====================================================

export type ZohoNoteSource = 'lead' | 'deal';

export interface ZohoNoteForAI {
  source: ZohoNoteSource;
  createdTime?: string;
  desarrollo?: string;
  owner?: string;
  statusOrStage?: string;
  text: string;
}

export interface ZohoNotesInsightsRequest {
  notes: ZohoNoteForAI[];
  context?: {
    period?: 'month' | 'quarter' | 'year';
    startDate?: string;
    endDate?: string;
    desarrollo?: string;
    source?: string;
    owner?: string;
    status?: string;
  };
}

export interface ZohoNotesInsightsResponse {
  summary: string;
  topThemes: Array<{ label: string; count: number; examples: string[] }>;
  topObjections: Array<{ label: string; count: number; examples: string[] }>;
  nextActions: Array<{ label: string; count: number; examples: string[] }>;
  frictionSignals: Array<{ label: string; count: number; examples: string[] }>;
  sentiment: { positive: number; neutral: number; negative: number };
  metrics: {
    noAnswerOrNoContact: number;
    priceOrBudget: number;
    financingOrCredit: number;
    locationOrArea: number;
    timingOrUrgency: number;
  };
}

export async function getZohoNotesInsightsAI(
  body: ZohoNotesInsightsRequest
): Promise<ZohoNotesInsightsResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const response = await fetcher<{ success: boolean; data: ZohoNotesInsightsResponse; error?: string }>(
    '/api/zoho/notes-insights',
    {
      method: 'POST',
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
      body: JSON.stringify(body),
    }
  );

  if (!response.success) {
    throw new Error(response.error || 'Error generando insights con IA');
  }

  return response.data;
}

export async function getZohoLeads(page: number = 1, perPage: number = 200): Promise<ZohoLeadsResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: ZohoLeadsResponse }>(
    `/api/zoho/leads?page=${page}&per_page=${perPage}`,
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

export async function getZohoDeals(page: number = 1, perPage: number = 200): Promise<ZohoDealsResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: ZohoDealsResponse }>(
    `/api/zoho/deals?page=${page}&per_page=${perPage}`,
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

export async function getZohoStats(filters?: {
  desarrollo?: string;
  lastMonth?: boolean;
  startDate?: Date;
  endDate?: Date;
}): Promise<ZohoStats> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  // Construir query string con los filtros
  const params = new URLSearchParams();
  if (filters?.desarrollo) {
    params.append('desarrollo', filters.desarrollo);
  }
  if (filters?.lastMonth) {
    params.append('lastMonth', 'true');
  }
  if (filters?.startDate) {
    params.append('startDate', filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    params.append('endDate', filters.endDate.toISOString());
  }
  
  const queryString = params.toString();
  const url = queryString ? `/api/zoho/stats?${queryString}` : '/api/zoho/stats';
  
  const response = await fetcher<{ success: boolean; data: ZohoStats }>(
    url,
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

/**
 * Inicia una sincronización de datos de Zoho CRM
 * @param type Tipo de sincronización: 'leads', 'deals' o 'full'
 */
export async function triggerZohoSync(type: 'leads' | 'deals' | 'full' = 'full'): Promise<ZohoSyncResult> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  try {
    const response = await fetcher<{ success: boolean; data: ZohoSyncResult; error?: string }>(
      `/api/zoho/sync?type=${type}`,
      {
        method: 'POST',
        headers: token ? {
          'Authorization': `Bearer ${token}`,
        } : undefined,
      }
    );
    
    if (!response.success) {
      throw new Error(response.error || 'Error al sincronizar datos de Zoho');
    }
    
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Error al sincronizar datos de Zoho');
  }
}

// =====================================================
// ZOHO CRM SYNC API
// =====================================================

export interface ZohoSyncLog {
  id: number;
  sync_type: 'leads' | 'deals' | 'full';
  status: 'success' | 'error' | 'partial';
  records_synced: number;
  records_updated: number;
  records_created: number;
  records_failed: number;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
}

export interface ZohoSyncResult {
  syncType: 'leads' | 'deals' | 'full';
  status: 'success' | 'error' | 'partial';
  recordsSynced: number;
  recordsUpdated: number;
  recordsCreated: number;
  recordsFailed: number;
  durationMs: number;
  errorMessage?: string;
}

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
  module: 'Leads' | 'Deals';
  totalFields: number;
  standardFields: number;
  customFields: number;
  fields: ZohoField[];
  organized: {
    standard: ZohoField[];
    custom: ZohoField[];
    byType: {
      text: ZohoField[];
      number: ZohoField[];
      date: ZohoField[];
      picklist: ZohoField[];
      lookup: ZohoField[];
      owner: ZohoField[];
      boolean: ZohoField[];
      other: ZohoField[];
    };
  };
}

/**
 * Sincroniza datos de Zoho CRM
 */
export async function syncZohoData(type: 'leads' | 'deals' | 'full' = 'full'): Promise<ZohoSyncResult> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: ZohoSyncResult }>(
    `/api/zoho/sync?type=${type}`,
    {
      method: 'POST',
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

/**
 * Obtiene los logs de sincronización
 */
export async function getZohoSyncLogs(filters?: {
  limit?: number;
  offset?: number;
  type?: 'leads' | 'deals' | 'full';
  status?: 'success' | 'error' | 'partial';
}): Promise<{ logs: ZohoSyncLog[]; total: number; limit: number; offset: number }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const params = new URLSearchParams();
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  if (filters?.type) params.append('type', filters.type);
  if (filters?.status) params.append('status', filters.status);
  
  const queryString = params.toString();
  const url = queryString ? `/api/zoho/sync/logs?${queryString}` : '/api/zoho/sync/logs';
  
  const response = await fetcher<{ success: boolean; data: { logs: ZohoSyncLog[]; total: number; limit: number; offset: number } }>(
    url,
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

/**
 * Obtiene los campos disponibles de un módulo de Zoho
 */
export async function getZohoFields(module: 'Leads' | 'Deals'): Promise<ZohoFieldsResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: ZohoFieldsResponse }>(
    `/api/zoho/fields?module=${module}`,
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

/**
 * Obtiene el estado de la última sincronización
 */
export async function getLastZohoSync(): Promise<ZohoSyncLog | null> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: ZohoSyncLog | null }>(
    '/api/zoho/sync',
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

