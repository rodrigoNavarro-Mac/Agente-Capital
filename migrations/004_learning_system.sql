-- =====================================================
-- MIGRACIÓN: SISTEMA DE APRENDIZAJE CONTINUO
-- =====================================================
-- Tablas para implementar:
-- 1. Aprendizaje por interacción (RLAIF interno)
-- 2. Re-indexación inteligente de RAG
-- 3. Memoria operativa del agente
--
-- Fecha: 2024
-- =====================================================

-- =====================================================
-- TABLA: response_learning
-- Aprendizaje por interacción - Almacena respuestas aprendidas
-- =====================================================
CREATE TABLE IF NOT EXISTS response_learning (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    answer TEXT NOT NULL,
    quality_score FLOAT DEFAULT 0,
    usage_count INT DEFAULT 0,
    last_improved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE response_learning IS 'Aprendizaje por interacción: almacena respuestas aprendidas con calificaciones';
COMMENT ON COLUMN response_learning.query IS 'Texto de la consulta (normalizado)';
COMMENT ON COLUMN response_learning.answer IS 'Respuesta aprendida';
COMMENT ON COLUMN response_learning.quality_score IS 'Score de calidad promedio (-1 a +1, donde +1 es excelente)';
COMMENT ON COLUMN response_learning.usage_count IS 'Número de veces que se ha usado esta respuesta';
COMMENT ON COLUMN response_learning.last_improved_at IS 'Última vez que se actualizó el score';

-- Índice único en query para evitar duplicados
CREATE UNIQUE INDEX IF NOT EXISTS idx_response_learning_query ON response_learning(query);
-- Índice para búsquedas por calidad
CREATE INDEX IF NOT EXISTS idx_response_learning_quality ON response_learning(quality_score);
-- Índice para búsquedas por uso
CREATE INDEX IF NOT EXISTS idx_response_learning_usage ON response_learning(usage_count DESC);

-- =====================================================
-- TABLA: chunk_stats
-- Estadísticas de desempeño de chunks para re-ranking
-- =====================================================
CREATE TABLE IF NOT EXISTS chunk_stats (
    chunk_id TEXT PRIMARY KEY,
    success_count INT DEFAULT 0,
    fail_count INT DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE chunk_stats IS 'Estadísticas de desempeño de chunks para re-ranking inteligente';
COMMENT ON COLUMN chunk_stats.chunk_id IS 'ID del chunk en Pinecone';
COMMENT ON COLUMN chunk_stats.success_count IS 'Número de veces que este chunk resultó en respuesta exitosa (rating >= 4)';
COMMENT ON COLUMN chunk_stats.fail_count IS 'Número de veces que este chunk resultó en respuesta fallida (rating <= 2)';
COMMENT ON COLUMN chunk_stats.last_used IS 'Última vez que se usó este chunk';

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_chunk_stats_success ON chunk_stats(success_count DESC);
CREATE INDEX IF NOT EXISTS idx_chunk_stats_fail ON chunk_stats(fail_count DESC);
CREATE INDEX IF NOT EXISTS idx_chunk_stats_last_used ON chunk_stats(last_used DESC);

-- =====================================================
-- TABLA: agent_memory
-- Memoria operativa del agente - Temas importantes aprendidos
-- =====================================================
CREATE TABLE IF NOT EXISTS agent_memory (
    id SERIAL PRIMARY KEY,
    topic VARCHAR(255) UNIQUE NOT NULL,
    summary TEXT NOT NULL,
    importance FLOAT DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE agent_memory IS 'Memoria operativa: temas importantes aprendidos del sistema';
COMMENT ON COLUMN agent_memory.topic IS 'Tema o tópico identificado (ej: campo_magno_precios)';
COMMENT ON COLUMN agent_memory.summary IS 'Resumen del conocimiento sobre este tema';
COMMENT ON COLUMN agent_memory.importance IS 'Nivel de importancia (0-1, donde 1 es crítico)';
COMMENT ON COLUMN agent_memory.last_updated IS 'Última vez que se actualizó esta memoria';

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_agent_memory_importance ON agent_memory(importance DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_topic ON agent_memory(topic);
CREATE INDEX IF NOT EXISTS idx_agent_memory_last_updated ON agent_memory(last_updated DESC);

-- =====================================================
-- TABLA: query_logs_chunks
-- Relación entre query_logs y chunks usados (para tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS query_logs_chunks (
    id SERIAL PRIMARY KEY,
    query_log_id INTEGER REFERENCES query_logs(id) ON DELETE CASCADE,
    chunk_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE query_logs_chunks IS 'Relación entre logs de consultas y chunks usados para tracking de desempeño';
COMMENT ON COLUMN query_logs_chunks.query_log_id IS 'ID del log de consulta';
COMMENT ON COLUMN query_logs_chunks.chunk_id IS 'ID del chunk usado en esta consulta';

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_query_logs_chunks_log ON query_logs_chunks(query_log_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_chunks_chunk ON query_logs_chunks(chunk_id);

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================

