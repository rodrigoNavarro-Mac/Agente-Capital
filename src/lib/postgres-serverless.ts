/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - POSTGRESQL CLIENT (SERVERLESS OPTIMIZED)
 * =====================================================
 * 
 * Esta versión está optimizada para entornos serverless (Next.js, Vercel, etc.)
 * 
 * CARACTERÍSTICAS:
 * - Conexiones directas (no pooling) para evitar conexiones muertas
 * - Max = 1 conexión por función (compatible con serverless)
 * - Cierre explícito de conexiones después de cada query
 * - Keyset pagination en lugar de OFFSET
 * - Timeouts defensivos
 * - Manejo robusto de errores de conexión
 * 
 * USO:
 * - Importar funciones desde este archivo en lugar de postgres.ts
 * - Las funciones tienen la misma firma, pero implementación optimizada
 */

import { Client, QueryResult, QueryResultRow } from 'pg';
import type { 
  User, 
  Role, 
  DocumentMetadata, 
  QueryLog, 
  AgentConfig,
  UserDevelopment,
  Zone,
  DocumentContentType,
  Permission
} from '@/types/documents';
import type { ZohoLead, ZohoDeal } from '@/lib/zoho-crm';

// =====================================================
// TIPOS PARA KEYSET PAGINATION
// =====================================================

/**
 * Resultado de una query con keyset pagination
 */
export interface KeysetPaginationResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Opciones para keyset pagination
 */
export interface KeysetPaginationOptions {
  cursor?: string | null;
  limit: number;
  orderBy?: 'asc' | 'desc';
}

/**
 * Configuración para queryWithKeyset
 */
export interface KeysetQueryConfig {
  cursorColumn: string;
  cursorType?: 'id' | 'timestamp' | 'string';
  timeout?: number;
}

// =====================================================
// CONFIGURACIÓN SERVERLESS
// =====================================================

/**
 * Configuración optimizada para serverless
 * 
 * DIFERENCIAS CLAVE vs. postgres.ts:
 * 1. Usa Client (conexión directa) en lugar de Pool
 * 2. Max = 1 (una conexión por función)
 * 3. Timeouts más largos para cold starts
 * 4. Conexión directa (no pooler) para evitar conexiones muertas
 */
function getServerlessConfig() {
  // Priorizar conexión directa (non-pooling) para serverless
  const connectionString =
    process.env.DATABASE_URL_DIRECT ||           // ⭐ PRIORIDAD: Conexión directa explícita
    process.env.DATABASE_URL ||                  // Conexión manual
    process.env.POSTGRES_URL_NON_POOLING ||      // Variable de integración Vercel
    process.env.POSTGRES_PRISMA_URL;            // Variable alternativa

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_DIRECT o DATABASE_URL no configurada. ' +
      'Para serverless, usa la conexión "Direct connection" de Supabase.'
    );
  }

  // Validar formato
  if (!connectionString.startsWith('postgresql://') && 
      !connectionString.startsWith('postgres://')) {
    throw new Error('Formato inválido de cadena de conexión');
  }

  // Parsear URL para configuración SSL
  let parsedUrl: URL | null = null;
  let hostname = 'unknown';
  
  try {
    parsedUrl = new URL(connectionString);
    hostname = parsedUrl.hostname;
  } catch (e) {
    console.error('Error parseando cadena de conexión:', e);
  }

  // Detectar si es Supabase
  const isSupabase = hostname.includes('supabase.co') || 
                     hostname.includes('supabase') ||
                     !!process.env.POSTGRES_URL;

  // Configuración base
  const baseConfig: any = {
    connectionString,
    // Timeouts defensivos para serverless (cold starts pueden ser lentos)
    connectionTimeoutMillis: 15000,  // 15s para cold start
    query_timeout: 20000,             // 20s para queries largas
    // Forzar IPv4 (Vercel no soporta IPv6)
    family: 4,
  };

  // SSL requerido para Supabase
  if (isSupabase || hostname !== 'localhost') {
    baseConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  return baseConfig;
}

// =====================================================
// FUNCIONES DE CONEXIÓN SERVERLESS
// =====================================================

/**
 * Ejecuta una query con conexión directa (serverless-safe)
 * 
 * PATRÓN SERVERLESS:
 * 1. Crea una nueva conexión para cada query
 * 2. Ejecuta la query
 * 3. Cierra la conexión explícitamente
 * 
 * Esto evita problemas con conexiones muertas del pool.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string, 
  params?: unknown[],
  retries: number = 2
): Promise<QueryResult<T>> {
  const config = getServerlessConfig();
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const client = new Client(config);
    
    try {
      // Conectar
      await client.connect();
      
      // Ejecutar query con timeout
      const result = await Promise.race([
        client.query<T>(text, params),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 20000)
        ),
      ]);
      
      // Cerrar conexión explícitamente
      await client.end();
      
      return result;
      
    } catch (error) {
      // Cerrar conexión en caso de error
      try {
        await client.end();
      } catch {
        // Ignorar errores al cerrar
      }
      
      lastError = error;
      
      // Verificar si es un error de conexión recuperable
      const isConnectionError = error instanceof Error && (
        error.message.includes('shutdown') ||
        error.message.includes('db_termination') ||
        error.message.includes('terminating connection') ||
        error.message.includes('Connection terminated') ||
        error.message.includes('server closed the connection') ||
        (error as Error & { code?: string }).code === 'XX000' ||
        (error as Error & { code?: string }).code === '57P01' ||
        (error as Error & { code?: string }).code === 'ECONNRESET'
      );
      
      // Si es error de conexión y hay reintentos, esperar y reintentar
      if (isConnectionError && attempt < retries) {
        const delay = Math.min(200 * Math.pow(2, attempt), 2000); // Backoff exponencial (max 2s)
        console.log(`⚠️ Error de conexión, reintentando en ${delay}ms (intento ${attempt + 1}/${retries + 1})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Si no es error de conexión o se agotaron los intentos, lanzar
      console.error(`Error en query (intento ${attempt + 1}/${retries + 1}):`, error);
      
      if (attempt === retries) {
        throw error;
      }
    }
  }
  
  // Esto no debería ejecutarse, pero TypeScript lo requiere
  throw lastError || new Error('Error desconocido en query');
}

/**
 * Obtiene un cliente para transacciones (usar con cuidado en serverless)
 * 
 * NOTA: En serverless, las transacciones deben ser cortas.
 * Considera usar queries individuales cuando sea posible.
 */
export async function getClient(): Promise<Client> {
  const config = getServerlessConfig();
  const client = new Client(config);
  await client.connect();
  return client;
}

/**
 * Verifica la conexión a PostgreSQL
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Error conectando a PostgreSQL:', error);
    return false;
  }
}

// =====================================================
// FUNCIONES DE KEYSET PAGINATION
// =====================================================

/**
 * Ejecuta una query con keyset pagination (cursor-based)
 * 
 * @param baseQuery Query SQL base (sin ORDER BY ni LIMIT)
 * @param params Parámetros de la query
 * @param paginationOptions Opciones de paginación
 * @param config Configuración del cursor
 * @returns Resultado con datos y cursor para siguiente página
 */
export async function queryWithKeyset<T extends QueryResultRow>(
  baseQuery: string,
  params: unknown[],
  paginationOptions: KeysetPaginationOptions,
  config: KeysetQueryConfig
): Promise<KeysetPaginationResult<T>> {
  const { cursor, limit, orderBy = 'desc' } = paginationOptions;
  const { cursorColumn, cursorType = 'id' } = config;
  
  let queryText = baseQuery;
  const queryParams: unknown[] = [...params];
  let paramIndex = params.length + 1;
  
  // Agregar condición de cursor si existe
  if (cursor) {
    const operator = orderBy === 'desc' ? '<' : '>';
    if (cursorType === 'timestamp') {
      queryText += ` AND ${cursorColumn} ${operator} $${paramIndex}`;
      queryParams.push(new Date(cursor));
    } else {
      queryText += ` AND ${cursorColumn} ${operator} $${paramIndex}`;
      queryParams.push(cursor);
    }
    paramIndex++;
  }
  
  // Agregar ORDER BY
  queryText += ` ORDER BY ${cursorColumn} ${orderBy.toUpperCase()}`;
  
  // Agregar LIMIT
  queryText += ` LIMIT $${paramIndex}`;
  queryParams.push(limit + 1); // +1 para detectar si hay más resultados
  
  // Ejecutar query
  const result = await query<T>(queryText, queryParams);
  
  // Determinar si hay más resultados
  const hasMore = result.rows.length > limit;
  const data = hasMore ? result.rows.slice(0, limit) : result.rows;
  
  // Obtener cursor del último registro
  let nextCursor: string | null = null;
  if (data.length > 0) {
    const lastRow = data[data.length - 1];
    const cursorValue = (lastRow as any)[cursorColumn];
    
    if (cursorType === 'timestamp' && cursorValue instanceof Date) {
      nextCursor = cursorValue.toISOString();
    } else {
      nextCursor = String(cursorValue);
    }
  }
  
  return {
    data,
    nextCursor,
    hasMore,
  };
}

/**
 * Alias de query para compatibilidad con postgres-keyset.ts
 */
export const queryServerless = query;

// =====================================================
// FUNCIONES DE USUARIOS (sin cambios en firma)
// =====================================================

export async function getUserById(id: number): Promise<User | null> {
  const result = await query<User>(
    `SELECT u.*, r.name as role 
     FROM users u 
     LEFT JOIN roles r ON u.role_id = r.id 
     WHERE u.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT u.*, r.name as role 
     FROM users u 
     LEFT JOIN roles r ON u.role_id = r.id 
     WHERE u.email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

export async function createUser(
  email: string,
  name: string,
  roleId: number,
  passwordHash?: string
): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (email, name, role_id, is_active, password_hash) 
     VALUES ($1, $2, $3, true, $4) 
     RETURNING *`,
    [email, name, roleId, passwordHash || null]
  );
  return result.rows[0];
}

export async function getUserDevelopments(userId: number): Promise<UserDevelopment[]> {
  const result = await query<UserDevelopment>(
    `SELECT * FROM user_developments WHERE user_id = $1`,
    [userId]
  );
  return result.rows;
}

export async function checkUserAccess(
  userId: number,
  zone: Zone,
  development: string,
  permission: 'can_upload' | 'can_query' = 'can_query'
): Promise<boolean> {
  const user = await getUserById(userId);
  
  const rolesWithFullAccess = ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'];
  
  if (user?.role && rolesWithFullAccess.includes(user.role)) {
    return true;
  }

  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM user_developments 
     WHERE user_id = $1 AND zone = $2 AND development = $3 AND ${permission} = true`,
    [userId, zone, development]
  );
  
  return parseInt(result.rows[0].count) > 0;
}

export async function getAllUsers(): Promise<User[]> {
  const result = await query<User>(
    `SELECT u.*, r.name as role 
     FROM users u 
     LEFT JOIN roles r ON u.role_id = r.id 
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

export async function updateUser(
  id: number,
  updates: {
    email?: string;
    name?: string;
    role_id?: number;
    is_active?: boolean;
  }
): Promise<User | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(updates.email);
  }
  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.role_id !== undefined) {
    fields.push(`role_id = $${paramIndex++}`);
    values.push(updates.role_id);
  }
  if (updates.is_active !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(updates.is_active);
  }

  if (fields.length === 0) {
    return getUserById(id);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await query<User>(
    `UPDATE users 
     SET ${fields.join(', ')} 
     WHERE id = $${paramIndex} 
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getUserById(id);
}

export async function deactivateUser(id: number): Promise<boolean> {
  const result = await query(
    `UPDATE users 
     SET is_active = false, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function assignUserDevelopment(
  userId: number,
  zone: Zone,
  development: string,
  canUpload: boolean = false,
  canQuery: boolean = true
): Promise<UserDevelopment> {
  const result = await query<UserDevelopment>(
    `INSERT INTO user_developments (user_id, zone, development, can_upload, can_query)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, zone, development) 
     DO UPDATE SET can_upload = $4, can_query = $5
     RETURNING *`,
    [userId, zone, development, canUpload, canQuery]
  );
  return result.rows[0];
}

export async function updateUserDevelopment(
  userId: number,
  zone: Zone,
  development: string,
  canUpload: boolean,
  canQuery: boolean
): Promise<UserDevelopment | null> {
  const result = await query<UserDevelopment>(
    `UPDATE user_developments 
     SET can_upload = $4, can_query = $5
     WHERE user_id = $1 AND zone = $2 AND development = $3
     RETURNING *`,
    [userId, zone, development, canUpload, canQuery]
  );
  return result.rows[0] || null;
}

export async function removeUserDevelopment(
  userId: number,
  zone: Zone,
  development: string
): Promise<boolean> {
  const result = await query(
    `DELETE FROM user_developments 
     WHERE user_id = $1 AND zone = $2 AND development = $3`,
    [userId, zone, development]
  );
  return (result.rowCount ?? 0) > 0;
}

// =====================================================
// FUNCIONES DE ROLES Y PERMISOS
// =====================================================

export async function getRoles(): Promise<Role[]> {
  const result = await query<Role & { permissions: string }>(
    `SELECT r.*, 
            ARRAY_AGG(p.name) as permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON r.id = rp.role_id
     LEFT JOIN permissions p ON rp.permission_id = p.id
     GROUP BY r.id`
  );
  
  return result.rows.map(row => ({
    ...row,
    permissions: row.permissions ? row.permissions as unknown as Permission[] : [],
  }));
}

export async function hasPermission(
  userId: number, 
  permission: Permission
): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM users u
     JOIN role_permissions rp ON u.role_id = rp.role_id
     JOIN permissions p ON rp.permission_id = p.id
     WHERE u.id = $1 AND p.name = $2`,
    [userId, permission]
  );
  
  return parseInt(result.rows[0].count) > 0;
}

// =====================================================
// FUNCIONES DE DOCUMENTOS
// =====================================================

export async function saveDocumentMeta(doc: Omit<DocumentMetadata, 'id' | 'created_at'>): Promise<DocumentMetadata> {
  const result = await query<DocumentMetadata>(
    `INSERT INTO documents_meta 
     (filename, zone, development, type, uploaded_by, pinecone_namespace, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [doc.filename, doc.zone, doc.development, doc.type, doc.uploaded_by, doc.pinecone_namespace, doc.tags || []]
  );
  return result.rows[0];
}

export async function getDocumentById(id: number): Promise<DocumentMetadata | null> {
  const result = await query<DocumentMetadata>(
    'SELECT * FROM documents_meta WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getDocuments(filters: {
  zone?: Zone;
  development?: string;
  type?: DocumentContentType;
  uploaded_by?: number;
}): Promise<DocumentMetadata[]> {
  let queryText = 'SELECT * FROM documents_meta WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.zone) {
    queryText += ` AND zone = $${paramIndex++}`;
    params.push(filters.zone);
  }
  if (filters.development) {
    queryText += ` AND development = $${paramIndex++}`;
    params.push(filters.development);
  }
  if (filters.type) {
    queryText += ` AND type = $${paramIndex++}`;
    params.push(filters.type);
  }
  if (filters.uploaded_by) {
    queryText += ` AND uploaded_by = $${paramIndex++}`;
    params.push(filters.uploaded_by);
  }

  queryText += ' ORDER BY created_at DESC';

  const result = await query<DocumentMetadata>(queryText, params);
  return result.rows;
}

export async function deleteDocument(id: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM documents_meta WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// =====================================================
// FUNCIONES DE QUERY LOGS (CON KEYSET PAGINATION)
// =====================================================

/**
 * Guarda un log de consulta
 */
export async function saveQueryLog(log: Omit<QueryLog, 'id' | 'created_at'>): Promise<QueryLog> {
  const result = await query<QueryLog>(
    `INSERT INTO query_logs 
     (user_id, query, zone, development, response, sources_used, response_time_ms, tokens_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      log.user_id, 
      log.query, 
      log.zone, 
      log.development, 
      log.response, 
      log.sources_used, 
      log.response_time_ms,
      log.tokens_used || null
    ]
  );
  return result.rows[0];
}

/**
 * Obtiene logs de consultas con KEYSET PAGINATION (cursor-based)
 * 
 * ✅ OPTIMIZACIÓN: Usa keyset pagination en lugar de OFFSET
 * 
 * @param options - Opciones de paginación
 * @param options.cursor - Cursor para paginación (created_at del último registro)
 * @param options.limit - Número de registros a retornar (default: 50)
 * 
 * @returns Logs y cursor para la siguiente página
 */
export async function getQueryLogs(options: {
  userId?: number;
  zone?: Zone;
  development?: string;
  limit?: number;
  cursor?: string; // ISO timestamp del último registro visto
}): Promise<{ logs: QueryLog[]; nextCursor: string | null }> {
  const { userId, zone, development, limit = 50, cursor } = options;
  
  let queryText = 'SELECT * FROM query_logs WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  // Filtrar por userId si está definido
  if (userId !== undefined && userId !== null) {
    queryText += ` AND user_id = $${paramIndex++}`;
    params.push(userId);
  }
  
  if (zone) {
    queryText += ` AND zone = $${paramIndex++}`;
    params.push(zone);
  }
  if (development) {
    queryText += ` AND development = $${paramIndex++}`;
    params.push(development);
  }

  // ✅ KEYSET PAGINATION: Usar cursor en lugar de OFFSET
  if (cursor) {
    queryText += ` AND created_at < $${paramIndex++}`;
    params.push(new Date(cursor));
  }

  // Ordenar por created_at DESC para keyset pagination
  queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query<QueryLog>(queryText, params);
  
  // Obtener cursor para la siguiente página (created_at del último registro)
  const nextCursor = result.rows.length > 0 
    ? result.rows[result.rows.length - 1].created_at.toISOString()
    : null;
  
  return { logs: result.rows, nextCursor };
}

/**
 * Función de compatibilidad: getQueryLogs con OFFSET (para migración gradual)
 * 
 * ⚠️ DEPRECATED: Usar getQueryLogs con cursor en su lugar
 */
export async function getQueryLogsWithOffset(options: {
  userId?: number;
  zone?: Zone;
  development?: string;
  limit?: number;
  offset?: number;
}): Promise<QueryLog[]> {
  const { userId, zone, development, limit = 50, offset = 0 } = options;
  
  let queryText = 'SELECT * FROM query_logs WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (userId !== undefined && userId !== null) {
    queryText += ` AND user_id = $${paramIndex++}`;
    params.push(userId);
  }
  
  if (zone) {
    queryText += ` AND zone = $${paramIndex++}`;
    params.push(zone);
  }
  if (development) {
    queryText += ` AND development = $${paramIndex++}`;
    params.push(development);
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await query<QueryLog>(queryText, params);
  return result.rows;
}

export async function deleteQueryLogs(options: {
  userId: number;
  zone?: Zone;
  development?: string;
}): Promise<number> {
  const { userId, zone, development } = options;

  let queryText = 'DELETE FROM query_logs WHERE user_id = $1';
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (zone) {
    queryText += ` AND zone = $${paramIndex++}`;
    params.push(zone);
  }
  if (development) {
    queryText += ` AND development = $${paramIndex++}`;
    params.push(development);
  }

  const result = await query(queryText, params);
  return result.rowCount || 0;
}

// =====================================================
// FUNCIONES DE CONFIGURACIÓN DEL AGENTE
// =====================================================

export async function getConfig(key: string): Promise<string | null> {
  const result = await query<AgentConfig>(
    'SELECT value FROM agent_config WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value || null;
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const result = await query<AgentConfig>(
    'SELECT key, value FROM agent_config'
  );
  
  const config: Record<string, string> = {};
  result.rows.forEach(row => {
    config[row.key] = row.value;
  });
  
  return config;
}

export async function setConfig(
  key: string, 
  value: string, 
  updatedBy: number,
  description?: string
): Promise<AgentConfig> {
  const result = await query<AgentConfig>(
    `INSERT INTO agent_config (key, value, description, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO UPDATE SET 
       value = EXCLUDED.value,
       description = COALESCE(EXCLUDED.description, agent_config.description),
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [key, value, description, updatedBy]
  );
  return result.rows[0];
}

export async function deleteConfig(key: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM agent_config WHERE key = $1',
    [key]
  );
  return (result.rowCount ?? 0) > 0;
}

// =====================================================
// FUNCIONES DE DESARROLLOS
// =====================================================

export async function getDevelopmentsByZone(): Promise<Record<string, string[]>> {
  const result = await query<{ zone: string; developments: string[] }>(
    `SELECT zone, ARRAY_AGG(DISTINCT development) as developments
     FROM documents_meta
     GROUP BY zone`
  );
  
  const developmentsByZone: Record<string, string[]> = {};
  result.rows.forEach(row => {
    developmentsByZone[row.zone] = row.developments;
  });
  
  return developmentsByZone;
}

export function getStaticDevelopments(): Record<string, string[]> {
  return {
    yucatan: [
      'riviera',
      'campo_magno',
      'augusta',
      'sendas',
      'arborea',
      'nortemerida'
    ],
    puebla: [
      'lomas_angelopolis',
      'parque_central',
      'sierra_norte'
    ],
    quintana_roo: [
      'fuego',
      'riviera_maya',
      'tulum_gardens'
    ],
    cdmx: [
      'polanco_residences',
      'santa_fe_towers'
    ],
    jalisco: [
      'zapopan_norte',
      'chapala_vista'
    ],
    nuevo_leon: [
      'monterrey_sur',
      'carretera_nacional'
    ]
  };
}

// =====================================================
// NOTA SOBRE FUNCIONES ADICIONALES
// =====================================================
// 
// Las siguientes funciones del archivo postgres.ts original
// pueden seguir usándose desde postgres.ts si no requieren
// optimización serverless específica:
// 
// - Funciones de caché (getCachedResponse, saveCachedResponse, etc.)
// - Funciones de autenticación (createUserSession, etc.)
// - Funciones de aprendizaje (getLearnedResponse, etc.)
// - Funciones de sincronización Zoho (syncZohoLead, etc.)
// 
// Estas funciones funcionarán correctamente si importas
// la función `query` desde este archivo y la usas en lugar
// de la del pool.
// 
// Para una migración completa, considera refactorizar estas
// funciones para usar la función `query` de este archivo.

// =====================================================
// FUNCIONES DE ZOHO CON KEYSET PAGINATION
// =====================================================

/**
 * Obtiene leads desde la base de datos local con KEYSET PAGINATION
 */
export async function getZohoLeadsFromDB(
  options: {
    cursor?: string; // ISO timestamp del último registro visto
    limit?: number;
    filters?: {
      desarrollo?: string;
      startDate?: Date;
      endDate?: Date;
    };
  } = {}
): Promise<{ leads: ZohoLead[]; total: number; nextCursor: string | null }> {
  const { cursor, limit = 200, filters } = options;
  
  try {
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.desarrollo) {
      whereConditions.push(`desarrollo = $${paramIndex}`);
      params.push(filters.desarrollo);
      paramIndex++;
    }

    // Filtrar por fecha
    if (filters?.startDate || filters?.endDate) {
      const startDate = filters.startDate;
      const endDate = filters.endDate;
      
      const dateConditions: string[] = [];
      
      if (startDate) {
        dateConditions.push(`(
          COALESCE(
            created_time,
            CASE 
              WHEN data->>'Creacion_de_Lead' IS NOT NULL 
              THEN (data->>'Creacion_de_Lead')::timestamptz
              WHEN data->>'Created_Time' IS NOT NULL 
              THEN (data->>'Created_Time')::timestamptz
              ELSE NULL
            END
          ) >= $${paramIndex}
        )`);
        params.push(startDate);
        paramIndex++;
      }
      
      if (endDate) {
        dateConditions.push(`(
          COALESCE(
            created_time,
            CASE 
              WHEN data->>'Creacion_de_Lead' IS NOT NULL 
              THEN (data->>'Creacion_de_Lead')::timestamptz
              WHEN data->>'Created_Time' IS NOT NULL 
              THEN (data->>'Created_Time')::timestamptz
              ELSE NULL
            END
          ) <= $${paramIndex}
        )`);
        params.push(endDate);
        paramIndex++;
      }
      
      if (dateConditions.length > 0) {
        whereConditions.push(`(${dateConditions.join(' AND ')})`);
      }
    }

    // ✅ KEYSET PAGINATION: Usar cursor en lugar de OFFSET
    if (cursor) {
      whereConditions.push(`modified_time < $${paramIndex}`);
      params.push(new Date(cursor));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Obtener total (solo si no hay cursor, para evitar costo innecesario)
    let total = 0;
    if (!cursor) {
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM zoho_leads ${whereClause}`,
        params.slice(0, -1) // Excluir el parámetro de cursor si existe
      );
      total = parseInt(countResult.rows[0].count);
    }

    // Obtener leads con keyset pagination
    const limitParamIndex = paramIndex;
    params.push(limit);
    
    const result = await query<{
      data: string;
      id: string;
      modified_time: Date;
    }>(
      `SELECT id, data, modified_time FROM zoho_leads ${whereClause} 
       ORDER BY modified_time DESC LIMIT $${limitParamIndex}`,
      params
    );

    // Obtener notas en batch
    const leadIds = result.rows.map(row => row.id);
    const notesMap = new Map<string, any[]>();
    
    if (leadIds.length > 0) {
      try {
        const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(',');
        const notesResult = await query<{
          parent_id: string;
          data: string;
        }>(
          `SELECT parent_id, data FROM zoho_notes 
           WHERE parent_type = 'Leads' AND parent_id IN (${placeholders})
           ORDER BY created_time DESC`,
          leadIds
        );
        
        notesResult.rows.forEach(row => {
          if (!notesMap.has(row.parent_id)) {
            notesMap.set(row.parent_id, []);
          }
          const note = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
          notesMap.get(row.parent_id)!.push(note);
        });
      } catch (error) {
        console.warn('⚠️ Error obteniendo notas de leads:', error);
      }
    }

    const leads: ZohoLead[] = result.rows.map((row) => {
      const lead = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      lead.Notes = notesMap.get(row.id) || [];
      return lead;
    });

    // Obtener cursor para la siguiente página
    const nextCursor = result.rows.length > 0 
      ? result.rows[result.rows.length - 1].modified_time.toISOString()
      : null;

    return { leads, total, nextCursor };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return { leads: [], total: 0, nextCursor: null };
    }
    throw error;
  }
}

/**
 * Obtiene deals desde la base de datos local con KEYSET PAGINATION
 */
export async function getZohoDealsFromDB(
  options: {
    cursor?: string; // ISO timestamp del último registro visto
    limit?: number;
    filters?: {
      desarrollo?: string;
      startDate?: Date;
      endDate?: Date;
    };
  } = {}
): Promise<{ deals: ZohoDeal[]; total: number; nextCursor: string | null }> {
  const { cursor, limit = 200, filters } = options;
  
  try {
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.desarrollo) {
      // Buscar en la columna desarrollo O en el JSONB (tanto "Desarrollo" como "Desarollo")
      // Nota: Zoho tiene un error de tipeo y usa "Desarollo" en lugar de "Desarrollo"
      // Esto asegura que encontremos deals incluso si la columna está NULL o el campo tiene el nombre incorrecto
      whereConditions.push(`(
        COALESCE(
          desarrollo,
          data->>'Desarrollo',
          data->>'Desarollo'
        ) = $${paramIndex}
      )`);
      params.push(filters.desarrollo);
      paramIndex++;
    }

    // Filtrar por fecha
    if (filters?.startDate || filters?.endDate) {
      const startDate = filters.startDate;
      const endDate = filters.endDate;
      
      const dateConditions: string[] = [];
      
      if (startDate) {
        dateConditions.push(`(
          COALESCE(
            created_time,
            CASE 
              WHEN data->>'Created_Time' IS NOT NULL 
              THEN (data->>'Created_Time')::timestamptz
              ELSE NULL
            END
          ) >= $${paramIndex}
        )`);
        params.push(startDate);
        paramIndex++;
      }
      
      if (endDate) {
        dateConditions.push(`(
          COALESCE(
            created_time,
            CASE 
              WHEN data->>'Created_Time' IS NOT NULL 
              THEN (data->>'Created_Time')::timestamptz
              ELSE NULL
            END
          ) <= $${paramIndex}
        )`);
        params.push(endDate);
        paramIndex++;
      }
      
      if (dateConditions.length > 0) {
        whereConditions.push(`(${dateConditions.join(' AND ')})`);
      }
    }

    // ✅ KEYSET PAGINATION: Usar cursor en lugar de OFFSET
    if (cursor) {
      whereConditions.push(`modified_time < $${paramIndex}`);
      params.push(new Date(cursor));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Obtener total (solo si no hay cursor)
    let total = 0;
    if (!cursor) {
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM zoho_deals ${whereClause}`,
        params.slice(0, -1)
      );
      total = parseInt(countResult.rows[0].count);
    }

    // Obtener deals con keyset pagination
    const limitParamIndex = paramIndex;
    params.push(limit);
    
    const result = await query<{
      data: string;
      id: string;
      modified_time: Date;
    }>(
      `SELECT id, data, modified_time FROM zoho_deals ${whereClause} 
       ORDER BY modified_time DESC LIMIT $${limitParamIndex}`,
      params
    );

    // Obtener notas en batch
    const dealIds = result.rows.map(row => row.id);
    const notesMap = new Map<string, any[]>();
    
    if (dealIds.length > 0) {
      try {
        const placeholders = dealIds.map((_, i) => `$${i + 1}`).join(',');
        const notesResult = await query<{
          parent_id: string;
          data: string;
        }>(
          `SELECT parent_id, data FROM zoho_notes 
           WHERE parent_type = 'Deals' AND parent_id IN (${placeholders})
           ORDER BY created_time DESC`,
          dealIds
        );
        
        notesResult.rows.forEach(row => {
          if (!notesMap.has(row.parent_id)) {
            notesMap.set(row.parent_id, []);
          }
          const note = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
          notesMap.get(row.parent_id)!.push(note);
        });
      } catch (error) {
        console.warn('⚠️ Error obteniendo notas de deals:', error);
      }
    }

    const deals: ZohoDeal[] = result.rows.map((row) => {
      const deal = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      deal.Notes = notesMap.get(row.id) || [];
      return deal;
    });

    // Obtener cursor para la siguiente página
    const nextCursor = result.rows.length > 0 
      ? result.rows[result.rows.length - 1].modified_time.toISOString()
      : null;

    return { deals, total, nextCursor };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return { deals: [], total: 0, nextCursor: null };
    }
    throw error;
  }
}
