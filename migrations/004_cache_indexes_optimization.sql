-- =====================================================
-- MIGRACIÓN 004: OPTIMIZACIÓN DE ÍNDICES DE CACHÉ
-- =====================================================
-- Índices adicionales para mejorar el rendimiento de las consultas de caché
-- NOTA: No podemos usar NOW() en predicados WHERE de índices porque no es IMMUTABLE
-- Los índices se crean sin filtro de tiempo, y las consultas filtran por expires_at

-- Índice compuesto para búsquedas por hash, zona y desarrollo (más común)
-- Este índice acelera las búsquedas exactas por hash con filtros de zona y desarrollo
CREATE INDEX IF NOT EXISTS idx_cache_hash_zone_dev 
ON query_cache(query_hash, zone, development);

-- Índice compuesto para búsquedas por embedding_id, zona y desarrollo
-- Este índice acelera las búsquedas semánticas por embedding_id
CREATE INDEX IF NOT EXISTS idx_cache_embedding_zone_dev 
ON query_cache(embedding_id, zone, development) 
WHERE embedding_id IS NOT NULL;

-- Índice para ordenar por hit_count y last_used_at (usado en ORDER BY)
-- Este índice acelera las consultas que ordenan por popularidad y uso reciente
CREATE INDEX IF NOT EXISTS idx_cache_hit_count_used 
ON query_cache(hit_count DESC, last_used_at DESC);

-- Índice adicional para filtrar por expires_at (útil para limpieza de caché)
CREATE INDEX IF NOT EXISTS idx_cache_expires_not_null 
ON query_cache(expires_at) 
WHERE expires_at IS NOT NULL;

COMMENT ON INDEX idx_cache_hash_zone_dev IS 'Índice compuesto para búsquedas rápidas por hash, zona y desarrollo';
COMMENT ON INDEX idx_cache_embedding_zone_dev IS 'Índice compuesto para búsquedas por embedding_id con filtros de zona y desarrollo';
COMMENT ON INDEX idx_cache_hit_count_used IS 'Índice para ordenar por popularidad y uso reciente';
COMMENT ON INDEX idx_cache_expires_not_null IS 'Índice para filtrar entradas con fecha de expiración (útil para limpieza)';

