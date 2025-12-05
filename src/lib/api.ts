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

export async function getZohoPipelines(): Promise<ZohoPipelinesResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: ZohoPipelinesResponse }>(
    '/api/zoho/pipelines',
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

export async function getZohoStats(): Promise<ZohoStats> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const response = await fetcher<{ success: boolean; data: ZohoStats }>(
    '/api/zoho/stats',
    {
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : undefined,
    }
  );
  
  return response.data;
}

