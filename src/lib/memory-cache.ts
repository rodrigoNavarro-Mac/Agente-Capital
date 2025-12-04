/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - MEMORY CACHE
 * =====================================================
 * Sistema de caché en memoria para consultas frecuentes
 * Mejora significativamente el rendimiento de endpoints GET
 */

// =====================================================
// TIPOS
// =====================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// =====================================================
// CONFIGURACIÓN
// =====================================================

// Tiempos de expiración en milisegundos
const CACHE_TTL = {
  DOCUMENTS: 5 * 60 * 1000,      // 5 minutos - documentos cambian ocasionalmente
  DEVELOPMENTS: 10 * 60 * 1000,  // 10 minutos - desarrollos cambian raramente
  STATS: 2 * 60 * 1000,          // 2 minutos - estadísticas cambian frecuentemente
  CONFIG: 30 * 60 * 1000,        // 30 minutos - configuración cambia raramente
  DEFAULT: 5 * 60 * 1000,        // 5 minutos por defecto
} as const;

// =====================================================
// CACHÉ EN MEMORIA
// =====================================================

// Map para almacenar las entradas del caché
// Usamos Map porque es más eficiente que objetos para operaciones frecuentes
const cache = new Map<string, CacheEntry<unknown>>();

// =====================================================
// FUNCIONES DE CACHÉ
// =====================================================

/**
 * Genera una clave única para el caché basada en los parámetros
 * @param prefix - Prefijo para identificar el tipo de caché
 * @param params - Parámetros que identifican la consulta
 * @returns Clave única para el caché
 */
function generateCacheKey(prefix: string, params: Record<string, unknown> = {}): string {
  // Ordenar las claves para asegurar consistencia
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${String(params[key])}`)
    .join('&');
  
  return sortedParams 
    ? `${prefix}:${sortedParams}`
    : prefix;
}

/**
 * Obtiene un valor del caché si existe y no ha expirado
 * @param key - Clave del caché
 * @returns El valor en caché o null si no existe o expiró
 */
function get<T>(key: string): T | null {
  const entry = cache.get(key);
  
  if (!entry) {
    return null;
  }
  
  // Verificar si expiró
  const now = Date.now();
  if (now > entry.expiresAt) {
    // Eliminar entrada expirada
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

/**
 * Guarda un valor en el caché
 * @param key - Clave del caché
 * @param data - Datos a guardar
 * @param ttl - Tiempo de vida en milisegundos (opcional)
 */
function set<T>(key: string, data: T, ttl?: number): void {
  const now = Date.now();
  const expiresAt = now + (ttl || CACHE_TTL.DEFAULT);
  
  cache.set(key, {
    data,
    timestamp: now,
    expiresAt,
  });
}

/**
 * Elimina una entrada del caché
 * @param key - Clave del caché (puede ser un patrón con *)
 */
function invalidate(keyPattern: string): void {
  if (keyPattern.includes('*')) {
    // Si tiene wildcard, buscar todas las claves que coincidan
    const pattern = keyPattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    
    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  } else {
    // Eliminación directa
    cache.delete(keyPattern);
  }
}

/**
 * Limpia todas las entradas expiradas del caché
 * Útil para ejecutar periódicamente y liberar memoria
 */
function cleanup(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

/**
 * Limpia todo el caché
 */
function clear(): void {
  cache.clear();
}

/**
 * Obtiene estadísticas del caché
 */
function getStats() {
  const now = Date.now();
  let expired = 0;
  let active = 0;
  
  for (const entry of cache.values()) {
    if (now > entry.expiresAt) {
      expired++;
    } else {
      active++;
    }
  }
  
  return {
    total: cache.size,
    active,
    expired,
  };
}

// =====================================================
// FUNCIONES DE ALTO NIVEL PARA ENDPOINTS ESPECÍFICOS
// =====================================================

/**
 * Obtiene o calcula datos con caché para documentos
 */
export async function getCachedDocuments<T>(
  params: Record<string, unknown>,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = generateCacheKey('documents', params);
  
  // Intentar obtener del caché
  const cached = get<T>(key);
  if (cached !== null) {
    console.log(`✅ Caché HIT (documents): ${key}`);
    return cached;
  }
  
  // Si no está en caché, obtener de la fuente
  console.log(`❌ Caché MISS (documents): ${key}`);
  const data = await fetcher();
  
  // Guardar en caché
  set(key, data, CACHE_TTL.DOCUMENTS);
  
  return data;
}

/**
 * Obtiene o calcula datos con caché para desarrollos
 */
export async function getCachedDevelopments<T>(
  params: Record<string, unknown>,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = generateCacheKey('developments', params);
  
  const cached = get<T>(key);
  if (cached !== null) {
    console.log(`✅ Caché HIT (developments): ${key}`);
    return cached;
  }
  
  console.log(`❌ Caché MISS (developments): ${key}`);
  const data = await fetcher();
  set(key, data, CACHE_TTL.DEVELOPMENTS);
  
  return data;
}

/**
 * Obtiene o calcula datos con caché para estadísticas
 */
export async function getCachedStats<T>(
  fetcher: () => Promise<T>
): Promise<T> {
  const key = generateCacheKey('stats');
  
  const cached = get<T>(key);
  if (cached !== null) {
    console.log(`✅ Caché HIT (stats): ${key}`);
    return cached;
  }
  
  console.log(`❌ Caché MISS (stats): ${key}`);
  const data = await fetcher();
  set(key, data, CACHE_TTL.STATS);
  
  return data;
}

/**
 * Obtiene o calcula datos con caché para configuración
 */
export async function getCachedConfig<T>(
  params: Record<string, unknown> = {},
  fetcher: () => Promise<T>
): Promise<T> {
  const key = generateCacheKey('config', params);
  
  const cached = get<T>(key);
  if (cached !== null) {
    console.log(`✅ Caché HIT (config): ${key}`);
    return cached;
  }
  
  console.log(`❌ Caché MISS (config): ${key}`);
  const data = await fetcher();
  set(key, data, CACHE_TTL.CONFIG);
  
  return data;
}

// =====================================================
// EXPORTAR FUNCIONES
// =====================================================

export const memoryCache = {
  get,
  set,
  invalidate,
  cleanup,
  clear,
  getStats,
  // Funciones específicas
  getCachedDocuments,
  getCachedDevelopments,
  getCachedStats,
  getCachedConfig,
};

// =====================================================
// LIMPIEZA AUTOMÁTICA
// =====================================================

// Variable para almacenar la referencia del intervalo
// Esto previene la creación de múltiples intervalos en hot reload
let cleanupInterval: NodeJS.Timeout | null = null;

// Limpiar entradas expiradas cada 15 minutos (menos frecuente para reducir overhead)
// Nota: La limpieza también ocurre automáticamente cuando se accede a entradas expiradas (lazy cleanup)
if (typeof setInterval !== 'undefined') {
  // Limpiar intervalo anterior si existe (útil en desarrollo con hot reload)
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(() => {
    const cleaned = cleanup();
    if (cleaned > 0) {
      console.log(`🧹 Limpieza automática de caché: ${cleaned} entradas eliminadas`);
    }
  }, 15 * 60 * 1000); // Cada 15 minutos (reducido de 5 a 15 para menos overhead)
}

