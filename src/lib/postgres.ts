/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - POSTGRESQL CLIENT
 * =====================================================
 * Módulo para interactuar con la base de datos PostgreSQL.
 * Maneja usuarios, roles, documentos, logs y configuración.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { 
  User, 
  Role, 
  DocumentMetadata, 
  QueryLog, 
  AgentConfig,
  UserDevelopment,
  Zone,
  DocumentContentType,
  Permission,
  ActionLog,
  ActionType,
  ResourceType
} from '@/types/documents';

// =====================================================
// CONFIGURACIÓN
// =====================================================

/**
 * Configuración del pool de conexiones PostgreSQL.
 * 
 * Soporta múltiples formas de configuración (en orden de prioridad):
 * 1. DATABASE_URL: ⭐ PRIORIDAD - Configuración manual desde Supabase Dashboard
 *    (RECOMENDADO: obtener "Direct connection" desde Supabase Settings > Database)
 * 2. POSTGRES_URL_NON_POOLING: Variable de integración Vercel (puede estar mal configurada)
 * 3. POSTGRES_PRISMA_URL: Variable alternativa de la integración de Supabase
 * 4. POSTGRES_URL: Pooler de Supabase (⚠️ puede causar "Tenant not found" en serverless)
 * 5. Variables individuales: POSTGRES_HOST, POSTGRES_PORT, etc.
 *    (útil para desarrollo local)
 * 
 * NOTA: La integración automática de Supabase en Vercel a veces configura mal las variables,
 * por eso priorizamos DATABASE_URL configurada manualmente desde Supabase Dashboard.
 * 
 * Para obtener la cadena correcta:
 * Supabase Dashboard > Settings > Database > Connection String > "Direct connection"
 */
function getPoolConfig() {
  // Intentar obtener la cadena de conexión en orden de prioridad
  // IMPORTANTE: DATABASE_URL (manual) tiene MÁS prioridad que las variables automáticas
  // porque la integración de Vercel a veces configura incorrectamente POSTGRES_URL_NON_POOLING
  const connectionString =
    process.env.DATABASE_URL ||               // ⭐ PRIORIDAD: Configuración manual (correcta)
    process.env.POSTGRES_URL_NON_POOLING ||  // Variables de integración Vercel (pueden estar mal)
    process.env.POSTGRES_PRISMA_URL ||        // Variable alternativa de Supabase
    process.env.POSTGRES_URL;                 // Pooler (último recurso, puede fallar en serverless)

  // Si encontramos una cadena de conexión, usarla
  if (connectionString) {
    // Validar formato básico de la URL
    if (!connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
      console.error('La cadena de conexión debe comenzar con postgresql:// o postgres://');
      throw new Error('Formato inválido de cadena de conexión. Debe comenzar con postgresql:// o postgres://');
    }
    
    // Extraer hostname para logging (sin exponer credenciales)
    let isSupabase = false;
    let hostname = 'unknown';
    let parsedUrl: URL | null = null;
    
    try {
      parsedUrl = new URL(connectionString);
      hostname = parsedUrl.hostname;
      // Detectar si es Supabase por hostname o por variables de entorno
      isSupabase = hostname.includes('supabase.co') || 
                   hostname.includes('supabase') ||
                   !!process.env.POSTGRES_URL || 
                   !!process.env.POSTGRES_PRISMA_URL ||
                   !!process.env.POSTGRES_URL_NON_POOLING;
      
      // IMPORTANTE: Para Supabase, usar parámetros individuales en lugar de connectionString
      // Esto asegura que la configuración SSL se aplique correctamente
      if (isSupabase && parsedUrl) {
        const password = parsedUrl.password || '';
        const username = parsedUrl.username || 'postgres';
        const database = parsedUrl.pathname.slice(1) || 'postgres';
        const port = parseInt(parsedUrl.port || '5432');
        
        return {
          host: hostname,
          port: port,
          user: username,
          password: password,
          database: database,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          // IMPORTANTE: Vercel NO soporta IPv6, forzar IPv4
          family: 4,  // Forzar IPv4 (evita error ENETUNREACH con IPv6)
          ssl: {
            rejectUnauthorized: false, // Necesario para Supabase en Vercel
          },
        };
      }
    } catch (e) {
      console.error('Error parseando cadena de conexión:', e);
      // Si no podemos parsear, asumir que es Supabase si viene de variables de Vercel
      isSupabase = !!process.env.POSTGRES_URL || 
                   !!process.env.POSTGRES_PRISMA_URL ||
                   !!process.env.POSTGRES_URL_NON_POOLING;
    }
    
    // Para conexiones no-Supabase, usar connectionString normalmente
    // Configurar SSL para otras conexiones remotas
    const sslConfig = hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== 'unknown'
      ? { 
          rejectUnauthorized: false // Para conexiones remotas
        }
      : undefined; // Sin SSL para localhost
    
    return {
      connectionString: connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      family: 4,  // Forzar IPv4 (Vercel NO soporta IPv6)
      ssl: sslConfig,
    };
  }

  // Si no encontramos ninguna cadena de conexión, usar variables individuales (desarrollo local)
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432');
  
  return {
    host,
    port,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'capital_plus_agent',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    family: 4,  // Forzar IPv4 para consistencia
  };
}

const pool = new Pool(getPoolConfig());

// Manejar errores del pool
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
  
  // Mensajes más descriptivos para errores comunes
  if (err instanceof Error) {
    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.error('DIAGNÓSTICO: No se puede resolver el hostname de la base de datos.');
      console.error('   Verifica que una de estas variables esté configurada en Vercel:');
      console.error('   - POSTGRES_URL (creada automáticamente por integración Supabase)');
      console.error('   - POSTGRES_PRISMA_URL');
      console.error('   - POSTGRES_URL_NON_POOLING');
      console.error('   - DATABASE_URL (si configurada manualmente)');
    } else if (err.message.includes('ECONNREFUSED')) {
      console.error('DIAGNÓSTICO: Conexión rechazada. Verifica que la base de datos esté accesible.');
    } else if (err.message.includes('password authentication failed')) {
      console.error('DIAGNÓSTICO: Error de autenticación. Verifica las credenciales en la cadena de conexión.');
    }
  }
});

// =====================================================
// FUNCIONES DE CONEXIÓN
// =====================================================

/**
 * Ejecuta una query en PostgreSQL
 * @param text - Query SQL
 * @param params - Parámetros de la query
 * @returns Resultado de la query
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string, 
  params?: unknown[]
): Promise<QueryResult<T>> {
  const _start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    return result;
  } catch (error) {
    console.error('Error en query:', error);
    
    // Mensajes más descriptivos para errores de conexión
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        console.error('DIAGNÓSTICO: No se puede resolver el hostname de la base de datos.');
        console.error('   Esto generalmente significa que:');
        console.error('   1. Ninguna variable de conexión está configurada en Vercel, o');
        console.error('   2. El hostname en la cadena de conexión es incorrecto, o');
        console.error('   3. Hay un problema de red/DNS en Vercel');
        console.error('');
        console.error('   SOLUCIÓN: Ve a Vercel Dashboard → Settings → Environment Variables');
        console.error('   La integración de Supabase debería crear automáticamente POSTGRES_URL.');
        console.error('   Si no existe, verifica la integración o crea manualmente:');
        console.error('   - POSTGRES_URL (recomendado)');
        console.error('   - POSTGRES_PRISMA_URL');
        console.error('   - POSTGRES_URL_NON_POOLING');
        console.error('   - DATABASE_URL (compatibilidad)');
      }
    }
    
    throw error;
  }
}

/**
 * Obtiene un cliente del pool para transacciones
 */
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

/**
 * Verifica la conexión a PostgreSQL
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const _result = await query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Error conectando a PostgreSQL:', error);
    return false;
  }
}

// =====================================================
// FUNCIONES DE USUARIOS
// =====================================================

/**
 * Obtiene un usuario por ID
 */
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

/**
 * Obtiene un usuario por email
 */
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

/**
 * Crea un nuevo usuario
 */
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

/**
 * Obtiene los desarrollos accesibles por un usuario
 */
export async function getUserDevelopments(userId: number): Promise<UserDevelopment[]> {
  const result = await query<UserDevelopment>(
    `SELECT * FROM user_developments WHERE user_id = $1`,
    [userId]
  );
  return result.rows;
}

/**
 * Verifica si un usuario tiene acceso a un desarrollo
 * 
 * Roles con acceso total a todos los desarrollos y zonas:
 * - ceo
 * - admin
 * - legal_manager
 * - post_sales
 * - marketing_manager
 */
export async function checkUserAccess(
  userId: number,
  zone: Zone,
  development: string,
  permission: 'can_upload' | 'can_query' = 'can_query'
): Promise<boolean> {
  // Primero verificar si el usuario tiene un rol con acceso total
  const user = await getUserById(userId);
  
  // Estos roles tienen acceso a TODOS los desarrollos y TODAS las zonas
  const rolesWithFullAccess = ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'];
  
  if (user?.role && rolesWithFullAccess.includes(user.role)) {
    return true;
  }

  // Para otros roles, verificar acceso específico al desarrollo
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM user_developments 
     WHERE user_id = $1 AND zone = $2 AND development = $3 AND ${permission} = true`,
    [userId, zone, development]
  );
  
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Obtiene todos los usuarios del sistema
 */
export async function getAllUsers(): Promise<User[]> {
  const result = await query<User>(
    `SELECT u.*, r.name as role 
     FROM users u 
     LEFT JOIN roles r ON u.role_id = r.id 
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

/**
 * Actualiza un usuario existente
 */
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

  // Obtener el usuario actualizado con el rol
  return getUserById(id);
}

/**
 * Desactiva un usuario (soft delete)
 */
export async function deactivateUser(id: number): Promise<boolean> {
  const result = await query(
    `UPDATE users 
     SET is_active = false, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Asigna un desarrollo a un usuario
 */
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

/**
 * Actualiza los permisos de un desarrollo para un usuario
 */
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

/**
 * Remueve un desarrollo de un usuario
 */
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

/**
 * Obtiene todos los roles
 */
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

/**
 * Verifica si un usuario tiene un permiso específico
 */
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

/**
 * Guarda metadata de un documento subido
 */
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

/**
 * Obtiene un documento por ID
 */
export async function getDocumentById(id: number): Promise<DocumentMetadata | null> {
  const result = await query<DocumentMetadata>(
    'SELECT * FROM documents_meta WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Obtiene documentos por filtros
 */
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

/**
 * Elimina un documento por ID
 */
export async function deleteDocument(id: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM documents_meta WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// =====================================================
// FUNCIONES DE QUERY LOGS
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
 * Obtiene logs de consultas con paginación
 */
export async function getQueryLogs(options: {
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

  // IMPORTANTE: Si userId está definido, SIEMPRE filtrar por él
  // Si no está definido, solo los admins deberían ver todos los logs
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

/**
 * Elimina logs de consultas (historial de chat)
 * IMPORTANTE: No permite eliminar si el usuario es admin
 */
export async function deleteQueryLogs(options: {
  userId: number;
  zone?: Zone;
  development?: string;
}): Promise<number> {
  const { userId, zone, development } = options;

  // Construir query de eliminación
  // Nota: La verificación de permisos se hace en el endpoint, no aquí
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

/**
 * Obtiene un valor de configuración
 */
export async function getConfig(key: string): Promise<string | null> {
  const result = await query<AgentConfig>(
    'SELECT value FROM agent_config WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value || null;
}

/**
 * Obtiene toda la configuración del agente
 */
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

/**
 * Actualiza o crea un valor de configuración
 */
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

/**
 * Elimina un valor de configuración
 */
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

/**
 * Obtiene todos los desarrollos agrupados por zona
 */
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

/**
 * Obtiene desarrollos predefinidos (hardcoded para inicio rápido)
 */
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
// FUNCIONES DE CACHÉ DE RESPUESTAS
// =====================================================

/**
 * Interfaz para entradas del caché
 */
export interface QueryCacheEntry {
  id: number;
  query_text: string;
  query_hash: string;
  zone: Zone;
  development: string;
  document_type?: string;
  response: string;
  sources_used?: string[];
  embedding_id?: string;
  hit_count: number;
  last_used_at: Date;
  created_at: Date;
  expires_at?: Date;
}

/**
 * Busca una respuesta en el caché por hash exacto
 */
export async function getCachedResponse(
  queryHash: string,
  zone: Zone,
  development: string,
  documentType?: string
): Promise<QueryCacheEntry | null> {
  let queryText = `
    SELECT * FROM query_cache 
    WHERE query_hash = $1 
    AND zone = $2 
    AND development = $3
    AND (expires_at IS NULL OR expires_at > NOW())
  `;
  const params: unknown[] = [queryHash, zone, development];
  let paramIndex = 4;

  if (documentType) {
    queryText += ` AND document_type = $${paramIndex++}`;
    params.push(documentType);
  } else {
    queryText += ` AND document_type IS NULL`;
  }

  queryText += ` ORDER BY hit_count DESC, last_used_at DESC LIMIT 1`;

  const result = await query<QueryCacheEntry>(queryText, params);
  return result.rows[0] || null;
}

/**
 * Guarda una respuesta en el caché
 */
export async function saveCachedResponse(
  entry: Omit<QueryCacheEntry, 'id' | 'created_at' | 'hit_count' | 'last_used_at'>
): Promise<QueryCacheEntry> {
  const result = await query<QueryCacheEntry>(
    `INSERT INTO query_cache 
     (query_text, query_hash, zone, development, document_type, response, sources_used, embedding_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (query_hash, zone, development, document_type) 
     DO UPDATE SET 
       response = EXCLUDED.response,
       sources_used = EXCLUDED.sources_used,
       hit_count = query_cache.hit_count + 1,
       last_used_at = NOW(),
       embedding_id = COALESCE(EXCLUDED.embedding_id, query_cache.embedding_id)
     RETURNING *`,
    [
      entry.query_text,
      entry.query_hash,
      entry.zone,
      entry.development,
      entry.document_type || null,
      entry.response,
      entry.sources_used || null,
      entry.embedding_id || null,
      entry.expires_at || null,
    ]
  );
  return result.rows[0];
}

/**
 * Obtiene un query log por ID
 */
export async function getQueryLogById(queryLogId: number): Promise<{
  id: number;
  query: string;
  response: string;
  feedback_rating: number | null;
  zone: string;
  development: string;
} | null> {
  try {
    const result = await query<{
      id: number;
      query: string;
      response: string;
      feedback_rating: number | null;
      zone: string;
      development: string;
    }>(
      `SELECT id, query, response, feedback_rating, zone, development
       FROM query_logs
       WHERE id = $1`,
      [queryLogId]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error obteniendo query log:', error);
    return null;
  }
}

/**
 * Elimina entradas del caché basado en query, zone y development
 */
export async function invalidateCacheByQuery(
  queryString: string,
  zone: string,
  development: string,
  documentType?: string
): Promise<number> {
  try {
    const { createHash } = await import('crypto');
    const queryHash = createHash('md5')
      .update(queryString.toLowerCase().trim().replace(/\s+/g, ' '))
      .digest('hex');
    
    const result = await query<{ count: number }>(
      `DELETE FROM query_cache
       WHERE query_hash = $1
         AND zone = $2
         AND development = $3
         ${documentType ? 'AND document_type = $4' : 'AND document_type IS NULL'}
       RETURNING id`,
      documentType 
        ? [queryHash, zone, development, documentType]
        : [queryHash, zone, development]
    );
    
    return result.rows.length;
  } catch (error) {
    console.error('Error invalidando caché:', error);
    return 0;
  }
}

/**
 * Verifica si una respuesta en el caché tiene feedback negativo asociado
 * Busca en query_logs si hay respuestas similares con rating <= 2
 */
export async function hasBadFeedbackInCache(
  queryString: string,
  zone: string,
  development: string
): Promise<boolean> {
  try {
    const normalizedQuery = queryString.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Buscar si hay query_logs con el mismo query (o similar) que tengan feedback negativo
    const result = await query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM query_logs
       WHERE LOWER(TRIM(query)) = $1
         AND zone = $2
         AND development = $3
         AND feedback_rating IS NOT NULL
         AND feedback_rating <= 2`,
      [normalizedQuery, zone, development]
    );
    
    return (result.rows[0]?.count || 0) > 0;
  } catch (error) {
    console.error('Error verificando feedback negativo:', error);
    return false;
  }
}

/**
 * Incrementa el contador de hits de una entrada de caché
 */
export async function incrementCacheHit(cacheId: number): Promise<void> {
  await query(
    `UPDATE query_cache 
     SET hit_count = hit_count + 1, 
         last_used_at = NOW() 
     WHERE id = $1`,
    [cacheId]
  );
}

/**
 * Obtiene entradas de caché similares (por embedding_id)
 */
export async function getSimilarCachedResponses(
  embeddingIds: string[],
  zone: Zone,
  development: string,
  limit: number = 5
): Promise<QueryCacheEntry[]> {
  if (embeddingIds.length === 0) {
    return [];
  }

  const result = await query<QueryCacheEntry>(
    `SELECT * FROM query_cache 
     WHERE embedding_id = ANY($1::text[])
     AND zone = $2 
     AND development = $3
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY hit_count DESC, last_used_at DESC
     LIMIT $4`,
    [embeddingIds, zone, development, limit]
  );
  return result.rows;
}

/**
 * Limpia el caché expirado
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const result = await query(
      `DELETE FROM query_cache 
       WHERE expires_at IS NOT NULL 
       AND expires_at < NOW()`
    );
    return result.rowCount || 0;
  } catch (error) {
    // Si la tabla no existe aún, retornar 0
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      console.log('Tabla query_cache no existe aún. Ejecuta la migración 003_query_cache.sql');
      return 0;
    }
    throw error;
  }
}

// =====================================================
// FUNCIONES DE ACTION LOGS
// =====================================================

/**
 * Guarda un log de acción administrativa
 */
export async function saveActionLog(log: Omit<ActionLog, 'id' | 'created_at'>): Promise<ActionLog | null> {
  try {
    const result = await query<ActionLog>(
      `INSERT INTO action_logs 
       (user_id, action_type, resource_type, resource_id, zone, development, description, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        log.user_id,
        log.action_type,
        log.resource_type,
        log.resource_id || null,
        log.zone || null,
        log.development || null,
        log.description,
        log.metadata ? JSON.stringify(log.metadata) : null,
        log.ip_address || null,
        log.user_agent || null,
      ]
    );
    return result.rows[0];
  } catch (error) {
    // Si la tabla no existe, solo loguear y retornar null
    // Esto permite que la aplicación funcione aunque la migración no se haya ejecutado
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      console.log('Tabla action_logs no existe. La acción no se registró. Ejecuta la migración 002_action_logs.sql');
      return null;
    }
    // Si es otro error, lanzarlo
    throw error;
  }
}

/**
 * Obtiene logs de acciones con filtros
 */
export async function getActionLogs(options: {
  userId?: number;
  actionType?: ActionType;
  resourceType?: ResourceType;
  zone?: Zone;
  limit?: number;
  offset?: number;
}): Promise<ActionLog[]> {
  const { userId, actionType, resourceType, zone, limit = 50, offset = 0 } = options;
  
  try {
    let queryText = 'SELECT * FROM action_logs WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (userId) {
      queryText += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }
    if (actionType) {
      queryText += ` AND action_type = $${paramIndex++}`;
      params.push(actionType);
    }
    if (resourceType) {
      queryText += ` AND resource_type = $${paramIndex++}`;
      params.push(resourceType);
    }
    if (zone) {
      queryText += ` AND zone = $${paramIndex++}`;
      params.push(zone);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await query<ActionLog & { metadata: string | object }>(queryText, params);
    
    // Parsear metadata JSON solo si es una cadena
    // Si es JSONB en PostgreSQL, ya viene como objeto
    const parsedLogs = result.rows.map(row => {
      let parsedMetadata = undefined;
      
      if (row.metadata) {
        // Si metadata es una cadena, parsearla
        if (typeof row.metadata === 'string') {
          try {
            parsedMetadata = JSON.parse(row.metadata);
          } catch (e) {
            console.warn('[getActionLogs] Error parseando metadata:', e);
            parsedMetadata = undefined;
          }
        } else {
          // Si ya es un objeto, usarlo directamente
          parsedMetadata = row.metadata;
        }
      }
      
      return {
        ...row,
        metadata: parsedMetadata,
      } as ActionLog;
    });
    return parsedLogs;
  } catch (error) {
    // Si la tabla no existe, retornar array vacío
    // Esto puede pasar si la migración no se ha ejecutado aún
    if (error instanceof Error && error.message.includes('no existe la relación') || 
        error instanceof Error && error.message.includes('does not exist')) {
      console.log('Tabla action_logs no existe aún, retornando array vacío. Ejecuta la migración 002_action_logs.sql');
      return [];
    }
    // Si es otro error, lanzarlo
    throw error;
  }
}

// =====================================================
// FUNCIONES DE ESTADÍSTICAS
// =====================================================

/**
 * Obtiene estadísticas del dashboard
 */
export interface DashboardStats {
  totalDocuments: number;
  totalQueriesThisMonth: number;
  averageResponseTime: number; // en segundos
  averageRating: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Obtener total de documentos
  const documentsResult = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM documents_meta'
  );
  const totalDocuments = parseInt(documentsResult.rows[0]?.count || '0');

  // Obtener consultas del mes actual
  const queriesResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count 
     FROM query_logs 
     WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`
  );
  const totalQueriesThisMonth = parseInt(queriesResult.rows[0]?.count || '0');

  // Obtener tiempo promedio de respuesta del mes actual (convertir de ms a segundos)
  const responseTimeResult = await query<{ avg: string | null }>(
    `SELECT AVG(response_time_ms)::INTEGER as avg 
     FROM query_logs 
     WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) 
     AND response_time_ms IS NOT NULL`
  );
  // Convertir milisegundos a segundos y redondear a 2 decimales
  const averageResponseTime = responseTimeResult.rows[0]?.avg 
    ? Math.round((parseInt(responseTimeResult.rows[0].avg) / 1000) * 100) / 100
    : 0;

  // Obtener calificación promedio del mes actual (opcional, puede no existir la columna)
  let averageRating = 0;
  try {
    // Verificar primero si la columna existe antes de hacer la consulta
    const columnCheck = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'query_logs' 
        AND column_name = 'feedback_rating'
      ) as exists`
    );
    
    if (columnCheck.rows[0]?.exists) {
      const ratingResult = await query<{ avg: string | null }>(
        `SELECT AVG(feedback_rating)::NUMERIC(3,2) as avg 
         FROM query_logs 
         WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) 
         AND feedback_rating IS NOT NULL`
      );
      averageRating = ratingResult.rows[0]?.avg 
        ? parseFloat(ratingResult.rows[0].avg) 
        : 0;
    } else {
      // La columna no existe, usar valor por defecto
      console.log('Columna feedback_rating no disponible en query_logs, usando valor por defecto');
      averageRating = 0;
    }
  } catch (error) {
    // Si hay algún error al verificar o consultar, usar valor por defecto
    // Esto puede pasar si la base de datos no tiene la columna aún o hay problemas de permisos
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('feedback_rating') || errorMsg.includes('no existe la columna')) {
      console.log('Columna feedback_rating no disponible, usando valor por defecto');
    } else {
      // Otro tipo de error, registrar como advertencia pero no fallar
      console.warn('Error obteniendo calificación promedio:', errorMsg);
    }
    averageRating = 0;
  }

  return {
    totalDocuments,
    totalQueriesThisMonth,
    averageResponseTime,
    averageRating,
  };
}

// =====================================================
// CIERRE DE CONEXIÓN
// =====================================================

/**
 * Cierra el pool de conexiones
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Pool de PostgreSQL cerrado');
}

// =====================================================
// FUNCIONES DE AUTENTICACIÓN
// =====================================================

/**
 * Actualiza la contraseña de un usuario
 */
export async function updateUserPassword(
  userId: number,
  passwordHash: string
): Promise<boolean> {
  const result = await query(
    `UPDATE users 
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [passwordHash, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Crea un token de recuperación de contraseña
 */
export async function createPasswordResetToken(
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> {
  await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );
}

/**
 * Obtiene un token de recuperación de contraseña
 */
export async function getPasswordResetToken(token: string): Promise<{
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  used: boolean;
} | null> {
  const result = await query<{
    id: number;
    user_id: number;
    token: string;
    expires_at: Date;
    used: boolean;
  }>(
    `SELECT * FROM password_reset_tokens 
     WHERE token = $1 AND used = false AND expires_at > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * Marca un token de recuperación como usado
 */
export async function markPasswordResetTokenAsUsed(token: string): Promise<boolean> {
  const result = await query(
    `UPDATE password_reset_tokens 
     SET used = true 
     WHERE token = $1`,
    [token]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Crea una sesión de usuario
 */
export async function createUserSession(
  userId: number,
  sessionToken: string,
  refreshToken: string,
  expiresAt: Date,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await query(
    `INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, sessionToken, refreshToken, expiresAt, ipAddress || null, userAgent || null]
  );
}

/**
 * Obtiene una sesión por token
 */
export async function getUserSession(sessionToken: string): Promise<{
  id: number;
  user_id: number;
  session_token: string;
  refresh_token: string;
  expires_at: Date;
  last_used_at: Date;
} | null> {
  const result = await query<{
    id: number;
    user_id: number;
    session_token: string;
    refresh_token: string;
    expires_at: Date;
    last_used_at: Date;
  }>(
    `SELECT * FROM user_sessions 
     WHERE session_token = $1 AND expires_at > NOW()`,
    [sessionToken]
  );
  return result.rows[0] || null;
}

/**
 * Elimina una sesión específica
 */
export async function deleteUserSession(sessionToken: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM user_sessions WHERE session_token = $1`,
    [sessionToken]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Elimina todas las sesiones de un usuario
 */
export async function deleteAllUserSessions(userId: number): Promise<number> {
  const result = await query(
    `DELETE FROM user_sessions WHERE user_id = $1`,
    [userId]
  );
  return result.rowCount ?? 0;
}

/**
 * Actualiza el último login de un usuario
 */
export async function updateLastLogin(userId: number): Promise<void> {
  await query(
    `UPDATE users 
     SET last_login = CURRENT_TIMESTAMP, 
         failed_login_attempts = 0,
         locked_until = NULL
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Incrementa el contador de intentos fallidos de login
 */
export async function incrementFailedLoginAttempts(userId: number): Promise<void> {
  await query(
    `UPDATE users 
     SET failed_login_attempts = failed_login_attempts + 1
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Resetea el contador de intentos fallidos
 */
export async function resetFailedLoginAttempts(userId: number): Promise<void> {
  await query(
    `UPDATE users 
     SET failed_login_attempts = 0, locked_until = NULL
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Bloquea la cuenta de un usuario por intentos fallidos (5 minutos)
 */
export async function lockUserAccount(userId: number, minutes: number = 5): Promise<void> {
  const lockedUntil = new Date();
  lockedUntil.setMinutes(lockedUntil.getMinutes() + minutes);
  
  await query(
    `UPDATE users 
     SET locked_until = $1
     WHERE id = $2`,
    [lockedUntil, userId]
  );
}

/**
 * Desbloquea la cuenta de un usuario
 */
export async function unlockUserAccount(userId: number): Promise<void> {
  await query(
    `UPDATE users 
     SET locked_until = NULL, failed_login_attempts = 0
     WHERE id = $1`,
    [userId]
  );
}

// =====================================================
// FUNCIONES DE FEEDBACK Y APRENDIZAJE
// =====================================================

/**
 * Guarda feedback de una respuesta
 */
export async function saveFeedback(data: {
  query_log_id: number;
  rating: number;
  comment?: string | null;
}): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `UPDATE query_logs 
     SET feedback_rating = $1, feedback_comment = $2
     WHERE id = $3
     RETURNING id`,
    [data.rating, data.comment || null, data.query_log_id]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Query log con ID ${data.query_log_id} no encontrado`);
  }
  
  return result.rows[0];
}

/**
 * Actualiza estadísticas de chunks basado en feedback
 */
export async function updateChunkStats(queryLogId: number, rating: number): Promise<void> {
  try {
    // Obtener los chunks usados en esta consulta
    const chunksResult = await query<{ chunk_id: string }>(
      `SELECT chunk_id FROM query_logs_chunks WHERE query_log_id = $1`,
      [queryLogId]
    );
    
    if (chunksResult.rows.length === 0) {
      // Si no hay chunks registrados, intentar obtenerlos de sources_used
      // Esto es un fallback si query_logs_chunks no está poblado
      const logResult = await query<{ sources_used: string[] | null }>(
        `SELECT sources_used FROM query_logs WHERE id = $1`,
        [queryLogId]
      );
      
      if (logResult.rows.length === 0) {
        console.log(`Query log ${queryLogId} no encontrado para actualizar chunk stats`);
        return;
      }
      
      // Si no hay chunks registrados, no podemos actualizar stats
      // Esto se puede mejorar en el futuro guardando chunk_ids en query_logs_chunks
      return;
    }
    
    const chunkIds = chunksResult.rows.map(row => row.chunk_id);
    
    // Determinar si fue éxito o fallo
    const isSuccess = rating >= 4;
    const isFailure = rating <= 2;
    
    // Actualizar estadísticas para cada chunk
    for (const chunkId of chunkIds) {
      if (isSuccess) {
        await query(
          `INSERT INTO chunk_stats (chunk_id, success_count, last_used)
           VALUES ($1, 1, NOW())
           ON CONFLICT (chunk_id) DO UPDATE SET
             success_count = chunk_stats.success_count + 1,
             last_used = NOW()`,
          [chunkId]
        );
      } else if (isFailure) {
        await query(
          `INSERT INTO chunk_stats (chunk_id, fail_count, last_used)
           VALUES ($1, 1, NOW())
           ON CONFLICT (chunk_id) DO UPDATE SET
             fail_count = chunk_stats.fail_count + 1,
             last_used = NOW()`,
          [chunkId]
        );
      }
    }
  } catch (error) {
    // Si las tablas no existen aún, solo loguear
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      console.log('Tablas de aprendizaje no existen aún. Ejecuta la migración 004_learning_system.sql');
      return;
    }
    throw error;
  }
}

/**
 * Registra los chunks usados en una consulta
 */
export async function registerQueryChunks(queryLogId: number, chunkIds: string[]): Promise<void> {
  try {
    if (chunkIds.length === 0) {
      return;
    }
    
    // Insertar relaciones
    for (const chunkId of chunkIds) {
      await query(
        `INSERT INTO query_logs_chunks (query_log_id, chunk_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [queryLogId, chunkId]
      );
    }
  } catch (error) {
    // Si la tabla no existe, solo loguear
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      console.log('Tabla query_logs_chunks no existe aún. Ejecuta la migración 004_learning_system.sql');
      return;
    }
    throw error;
  }
}

// =====================================================
// FUNCIONES DE RESPONSE LEARNING
// =====================================================

/**
 * Normaliza un query para búsqueda (similar a processQuery pero más simple)
 */
function normalizeQueryForLearning(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:()\[\]{}'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Obtiene respuestas aprendidas para una consulta
 * Busca tanto coincidencias exactas como similares usando similitud de texto
 */
export async function getLearnedResponse(queryText: string): Promise<{
  query: string;
  answer: string;
  quality_score: number;
  usage_count: number;
} | null> {
  try {
    const normalizedQuery = normalizeQueryForLearning(queryText);
    
    // Primero intentar búsqueda exacta
    const exactResult = await query<{
      query: string;
      answer: string;
      quality_score: number;
      usage_count: number;
    }>(
      `SELECT query, answer, quality_score, usage_count
       FROM response_learning
       WHERE LOWER(TRIM(query)) = $1
       ORDER BY quality_score DESC, usage_count DESC
       LIMIT 1`,
      [normalizedQuery]
    );
    
    if (exactResult.rows.length > 0) {
      return exactResult.rows[0];
    }
    
    // Si no hay coincidencia exacta, buscar similares usando similitud de texto
    // Usar pg_trgm (trigram similarity) si está disponible, o búsqueda por palabras clave
    const similarResult = await query<{
      query: string;
      answer: string;
      quality_score: number;
      usage_count: number;
      similarity: number;
    }>(
      `SELECT query, answer, quality_score, usage_count,
              CASE 
                WHEN LOWER(query) LIKE '%' || $1 || '%' THEN 0.8
                WHEN LOWER(query) LIKE $1 || '%' THEN 0.7
                WHEN LOWER(query) LIKE '%' || $1 THEN 0.6
                ELSE 0.5
              END as similarity
       FROM response_learning
       WHERE LOWER(query) LIKE '%' || $1 || '%'
          OR LOWER(query) LIKE $1 || '%'
          OR LOWER(query) LIKE '%' || $1
       ORDER BY quality_score DESC, similarity DESC, usage_count DESC
       LIMIT 1`,
      [normalizedQuery]
    );
    
    // Solo retornar si la similitud es razonable y el quality_score es bueno (>= 0.7)
    // Solo respuestas con buena calificación (quality_score >= 0.7 corresponde a rating >= 4)
    if (similarResult.rows.length > 0) {
      const bestMatch = similarResult.rows[0];
      if (bestMatch.similarity >= 0.6 && bestMatch.quality_score >= 0.7) {
        return {
          query: bestMatch.query,
          answer: bestMatch.answer,
          quality_score: bestMatch.quality_score,
          usage_count: bestMatch.usage_count,
        };
      }
    }
    
    return null;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return null;
    }
    throw error;
  }
}

/**
 * Incrementa el contador de uso de una respuesta aprendida
 */
export async function incrementLearnedResponseUsage(queryText: string): Promise<void> {
  try {
    const normalizedQuery = normalizeQueryForLearning(queryText);
    await query(
      `UPDATE response_learning
       SET usage_count = usage_count + 1
       WHERE LOWER(TRIM(query)) = $1`,
      [normalizedQuery]
    );
  } catch (error) {
    // Silenciar errores si la tabla no existe
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return;
    }
    // No lanzar error, solo loguear
    console.log('⚠️ Error incrementando uso de respuesta aprendida:', error);
  }
}

/**
 * Obtiene feedback reciente para procesamiento de aprendizaje
 */
export async function getRecentFeedback(hours: number = 24): Promise<Array<{
  id: number;
  query: string;
  response: string;
  feedback_rating: number;
}>> {
  try {
    const result = await query<{
      id: number;
      query: string;
      response: string;
      feedback_rating: number;
    }>(
      `SELECT id, query, response, feedback_rating
       FROM query_logs
       WHERE feedback_rating IS NOT NULL
         AND created_at > NOW() - INTERVAL '${hours} hours'
       ORDER BY created_at DESC`,
      []
    );
    
    return result.rows;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return [];
    }
    throw error;
  }
}

/**
 * Actualiza o crea una respuesta aprendida
 * Retorna true si fue creación, false si fue actualización
 */
export async function upsertLearnedResponse(
  queryText: string,
  answer: string,
  qualityScore: number
): Promise<{ created: boolean; updated: boolean }> {
  try {
    // Primero verificar si existe
    const existing = await query<{ id: number; quality_score: number; usage_count: number }>(
      `SELECT id, quality_score, usage_count 
       FROM response_learning 
       WHERE query = $1`,
      [queryText]
    );
    
    if (existing.rows.length > 0) {
      // Actualizar respuesta existente
      const existingRow = existing.rows[0];
      const newQualityScore = (existingRow.quality_score * existingRow.usage_count + qualityScore) / (existingRow.usage_count + 1);
      
      await query(
        `UPDATE response_learning
         SET quality_score = $1,
             usage_count = usage_count + 1,
             last_improved_at = NOW()
         WHERE id = $2`,
        [newQualityScore, existingRow.id]
      );
      
      return { created: false, updated: true };
    } else {
      // Crear nueva respuesta aprendida
      await query(
        `INSERT INTO response_learning (query, answer, quality_score, usage_count, last_improved_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (query) DO UPDATE SET
           quality_score = (response_learning.quality_score * response_learning.usage_count + $3) / (response_learning.usage_count + 1),
           usage_count = response_learning.usage_count + 1,
           last_improved_at = NOW()`,
        [queryText, answer, qualityScore]
      );
      
      return { created: true, updated: false };
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      console.log('Tabla response_learning no existe aún. Ejecuta la migración 004_learning_system.sql');
      return { created: false, updated: false };
    }
    throw error;
  }
}

// =====================================================
// FUNCIONES DE CHUNK STATS
// =====================================================

/**
 * Obtiene estadísticas de un chunk
 */
export async function getChunkStats(chunkId: string): Promise<{
  chunk_id: string;
  success_count: number;
  fail_count: number;
  success_ratio: number;
} | null> {
  try {
    const result = await query<{
      chunk_id: string;
      success_count: number;
      fail_count: number;
    }>(
      `SELECT chunk_id, success_count, fail_count
       FROM chunk_stats
       WHERE chunk_id = $1`,
      [chunkId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    const total = row.success_count + row.fail_count;
    const successRatio = total > 0 ? row.success_count / total : 0.5; // Default 0.5 si no hay datos
    
    return {
      ...row,
      success_ratio: successRatio,
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return null;
    }
    throw error;
  }
}

/**
 * Obtiene estadísticas de múltiples chunks
 */
export async function getMultipleChunkStats(chunkIds: string[]): Promise<Map<string, {
  success_count: number;
  fail_count: number;
  success_ratio: number;
}>> {
  const statsMap = new Map();
  
  if (chunkIds.length === 0) {
    return statsMap;
  }
  
  try {
    const result = await query<{
      chunk_id: string;
      success_count: number;
      fail_count: number;
    }>(
      `SELECT chunk_id, success_count, fail_count
       FROM chunk_stats
       WHERE chunk_id = ANY($1::text[])`,
      [chunkIds]
    );
    
    for (const row of result.rows) {
      const total = row.success_count + row.fail_count;
      const successRatio = total > 0 ? row.success_count / total : 0.5;
      
      statsMap.set(row.chunk_id, {
        success_count: row.success_count,
        fail_count: row.fail_count,
        success_ratio: successRatio,
      });
    }
    
    // Agregar chunks sin estadísticas con valores por defecto
    for (const chunkId of chunkIds) {
      if (!statsMap.has(chunkId)) {
        statsMap.set(chunkId, {
          success_count: 0,
          fail_count: 0,
          success_ratio: 0.5,
        });
      }
    }
  } catch (error) {
    // Si la tabla no existe, retornar valores por defecto
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      for (const chunkId of chunkIds) {
        statsMap.set(chunkId, {
          success_count: 0,
          fail_count: 0,
          success_ratio: 0.5,
        });
      }
      return statsMap;
    }
    throw error;
  }
  
  return statsMap;
}

/**
 * Obtiene chunks problemáticos para re-indexación
 */
export async function getProblematicChunks(daysSinceLastUse: number = 60): Promise<Array<{
  chunk_id: string;
  success_count: number;
  fail_count: number;
  last_used: Date;
}>> {
  try {
    const result = await query<{
      chunk_id: string;
      success_count: number;
      fail_count: number;
      last_used: Date;
    }>(
      `SELECT chunk_id, success_count, fail_count, last_used
       FROM chunk_stats
       WHERE (fail_count > success_count * 3 OR last_used < NOW() - INTERVAL '${daysSinceLastUse} days')
       ORDER BY fail_count DESC, last_used ASC`,
      []
    );
    
    return result.rows;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return [];
    }
    throw error;
  }
}

// =====================================================
// FUNCIONES DE AGENT MEMORY
// =====================================================

/**
 * Obtiene memorias del agente con importancia alta
 */
export async function getAgentMemories(minImportance: number = 0.7): Promise<Array<{
  topic: string;
  summary: string;
  importance: number;
}>> {
  try {
    const result = await query<{
      topic: string;
      summary: string;
      importance: number;
    }>(
      `SELECT topic, summary, importance
       FROM agent_memory
       WHERE importance >= $1
       ORDER BY importance DESC, last_updated DESC`,
      [minImportance]
    );
    
    return result.rows;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return [];
    }
    throw error;
  }
}

/**
 * Crea o actualiza una memoria del agente
 */
export async function upsertAgentMemory(
  topic: string,
  summary: string,
  importance: number
): Promise<void> {
  try {
    await query(
      `INSERT INTO agent_memory (topic, summary, importance, last_updated)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (topic) DO UPDATE SET
         summary = EXCLUDED.summary,
         importance = (agent_memory.importance + EXCLUDED.importance) / 2,
         last_updated = NOW()`,
      [topic, summary, importance]
    );
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      console.log('Tabla agent_memory no existe aún. Ejecuta la migración 004_learning_system.sql');
      return;
    }
    throw error;
  }
}

/**
 * Obtiene queries frecuentes para análisis de memoria
 */
export async function getFrequentQueries(days: number = 7, minCount: number = 10): Promise<Array<{
  query: string;
  count: number;
}>> {
  try {
    const result = await query<{
      query: string;
      count: string;
    }>(
      `SELECT query, COUNT(*) as count
       FROM query_logs
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY query
       HAVING COUNT(*) >= $1
       ORDER BY count DESC`,
      [minCount]
    );
    
    return result.rows.map(row => ({
      query: row.query,
      count: parseInt(row.count),
    }));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('no existe la relación') || 
        error.message.includes('does not exist'))) {
      return [];
    }
    throw error;
  }
}


