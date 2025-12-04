-- =====================================================
-- MIGRACIÓN 003: CACHÉ DE RESPUESTAS
-- =====================================================
-- Tabla para almacenar respuestas cacheadas de consultas
-- Permite responder más rápido a preguntas similares

-- =====================================================
-- TABLA: query_cache
-- Caché de respuestas a consultas frecuentes
-- =====================================================
CREATE TABLE IF NOT EXISTS query_cache (
    id SERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    query_hash VARCHAR(64) NOT NULL, -- Hash MD5 del query normalizado para búsqueda rápida exacta
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    document_type VARCHAR(100), -- Tipo de documento si aplica
    response TEXT NOT NULL,
    sources_used TEXT[],
    embedding_id VARCHAR(255), -- ID del embedding en Pinecone (namespace: cache)
    hit_count INTEGER DEFAULT 1, -- Número de veces que se ha usado esta respuesta
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE, -- Fecha de expiración (opcional, para invalidar caché antiguo)
    
    -- Índice único para evitar duplicados exactos
    UNIQUE(query_hash, zone, development, document_type)
);

COMMENT ON TABLE query_cache IS 'Caché de respuestas a consultas para mejorar rendimiento';
COMMENT ON COLUMN query_cache.query_hash IS 'Hash MD5 del query normalizado (lowercase, sin espacios extra)';
COMMENT ON COLUMN query_cache.embedding_id IS 'ID del vector en Pinecone para búsqueda semántica';
COMMENT ON COLUMN query_cache.hit_count IS 'Número de veces que esta respuesta ha sido utilizada';
COMMENT ON COLUMN query_cache.expires_at IS 'Fecha de expiración del caché (NULL = no expira)';

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_cache_hash ON query_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_cache_zone_dev ON query_cache(zone, development);
CREATE INDEX IF NOT EXISTS idx_cache_embedding ON query_cache(embedding_id) WHERE embedding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cache_last_used ON query_cache(last_used_at);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON query_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Función para limpiar caché expirado
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM query_cache 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_cache IS 'Elimina entradas de caché que han expirado';

