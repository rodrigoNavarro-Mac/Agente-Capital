/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - TYPE DEFINITIONS
 * =====================================================
 * Definiciones de tipos para el sistema de documentos,
 * usuarios, roles y configuración del agente.
 */

// =====================================================
// DOCUMENT TYPES
// =====================================================

/**
 * Tipos de documentos soportados para upload
 */
export type DocumentFileType = 'pdf' | 'csv' | 'docx';

/**
 * Tipos de contenido de documentos inmobiliarios
 */
export type DocumentContentType = 
  | 'brochure'      // Folletos de desarrollos
  | 'policy'        // Políticas internas
  | 'price'         // Listas de precios
  | 'inventory'     // Inventario de unidades
  | 'floor_plan'    // Planos de plantas
  | 'amenities'     // Amenidades
  | 'legal'         // Documentos legales
  | 'faq'           // Preguntas frecuentes
  | 'general';      // Información general

/**
 * Zonas geográficas donde opera Capital Plus
 */
export type Zone = 
  | 'yucatan'
  | 'puebla'
  | 'quintana_roo'
  | 'cdmx'
  | 'jalisco'
  | 'nuevo_leon';

/**
 * Metadatos de un documento subido
 */
export interface DocumentMetadata {
  id?: number;
  filename: string;
  zone: Zone;
  development: string;
  type: DocumentContentType;
  uploaded_by: number;
  pinecone_namespace: string;
  tags?: string[];
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Solicitud de upload de documento
 */
export interface UploadRequest {
  file: File;
  zone: Zone;
  development: string;
  type: DocumentContentType;
  uploaded_by: string | number;
}

/**
 * Respuesta del endpoint de upload
 */
export interface UploadResponse {
  success: boolean;
  message?: string;
  chunks?: number;
  pinecone_namespace?: string;
  document_id?: number;
  error?: string;
}

// =====================================================
// CHUNK TYPES
// =====================================================

/**
 * Chunk de texto para embeddings
 */
export interface TextChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

/**
 * Metadatos asociados a un chunk en Pinecone
 */
export interface ChunkMetadata {
  zone: Zone;
  development: string;
  type: DocumentContentType;
  page: number;
  chunk: number;
  sourceFileName: string;
  uploaded_by: number;
  created_at: string;
}

// =====================================================
// RAG QUERY TYPES
// =====================================================

/**
 * Solicitud de consulta RAG
 */
export interface RAGQueryRequest {
  query: string;
  zone: Zone;
  development: string;
  type?: DocumentContentType;
  userId: number;
  skipCache?: boolean; // Si es true, ignora el caché y genera una nueva respuesta
}

/**
 * Respuesta de consulta RAG
 */
export interface RAGQueryResponse {
  success: boolean;
  answer?: string;
  sources?: SourceReference[];
  error?: string;
  query_log_id?: number;
}

/**
 * Referencia a fuente de información
 */
export interface SourceReference {
  filename: string;
  page: number;
  chunk: number;
  relevance_score: number;
  text_preview: string;
}

// =====================================================
// USER & ROLE TYPES
// =====================================================

/**
 * Roles de usuario en el sistema
 */
export type UserRole = 
  | 'ceo'             // CEO - Acceso total
  | 'admin'           // Administrador - Acceso total
  | 'sales_manager'   // Gerente de Ventas
  | 'sales_agent'     // Agente de Ventas
  | 'post_sales'      // Post-Venta
  | 'legal_manager'   // Gerente Legal
  | 'marketing_manager' // Gerente de Marketing
  | 'manager'         // Gestión de desarrollos (legacy)
  | 'sales'           // Equipo de ventas (legacy)
  | 'support'         // Soporte al cliente (legacy)
  | 'viewer';         // Solo lectura (legacy)

/**
 * Permisos del sistema
 */
export type Permission = 
  | 'upload_documents'
  | 'delete_documents'
  | 'query_agent'
  | 'manage_users'
  | 'manage_config'
  | 'view_logs'
  | 'manage_developments';

/**
 * Usuario del sistema
 */
export interface User {
  id: number;
  email: string;
  name: string;
  role_id: number;
  role?: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Rol del sistema
 */
export interface Role {
  id: number;
  name: UserRole;
  description: string;
  permissions: Permission[];
}

/**
 * Relación usuario-desarrollo
 */
export interface UserDevelopment {
  user_id: number;
  zone: Zone;
  development: string;
  can_upload: boolean;
  can_query: boolean;
}

// =====================================================
// AGENT CONFIG TYPES
// =====================================================

/**
 * Configuración del agente de IA
 */
export interface AgentConfig {
  id: number;
  key: string;
  value: string;
  description?: string;
  updated_by: number;
  updated_at: Date;
}

/**
 * Configuración completa del agente
 */
export interface AgentSettings {
  temperature: number;
  top_k: number;
  chunk_size: number;
  chunk_overlap: number;
  max_tokens: number;
  system_prompt: string;
  restrictions?: string[];
}

/**
 * Request para actualizar configuración
 */
export interface AgentConfigUpdateRequest {
  key: string;
  value: string;
  updated_by: number;
}

// =====================================================
// QUERY LOG TYPES
// =====================================================

/**
 * Log de consulta al agente
 */
export interface QueryLog {
  id: number;
  user_id: number;
  query: string;
  zone: Zone;
  development: string;
  response: string;
  sources_used: string[];
  response_time_ms: number;
  tokens_used?: number;
  feedback_rating?: number; // Calificación del usuario (1-5)
  feedback_comment?: string | null; // Comentario del usuario
  created_at: Date;
}

/**
 * Log de acción administrativa
 */
export type ActionType = 'upload' | 'delete' | 'update' | 'create' | 'query';
export type ResourceType = 'document' | 'config' | 'user' | 'query';

export interface ActionLog {
  id: number;
  user_id: number;
  action_type: ActionType;
  resource_type: ResourceType;
  resource_id?: number;
  zone?: Zone;
  development?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

/**
 * Respuesta genérica de API
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Estructura de desarrollos por zona
 */
export interface DevelopmentsByZone {
  [zone: string]: string[];
}

// =====================================================
// PINECONE TYPES
// =====================================================

/**
 * Registro para upsert en Pinecone
 */
export interface PineconeRecord {
  id: string;
  values?: number[];
  metadata: ChunkMetadata;
}

/**
 * Filtro para query en Pinecone
 */
export interface PineconeFilter {
  development: string;
  type?: DocumentContentType;
}

/**
 * Match resultado de query en Pinecone
 */
export interface PineconeMatch {
  id: string;
  score: number;
  metadata: ChunkMetadata & { text?: string };
}

// =====================================================
// LM STUDIO TYPES
// =====================================================

/**
 * Mensaje para LM Studio
 */
export interface LMStudioMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Request para LM Studio
 */
export interface LMStudioRequest {
  model: string;
  messages: LMStudioMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Response de LM Studio
 */
export interface LMStudioResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

