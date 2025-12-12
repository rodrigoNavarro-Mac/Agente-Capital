-- =====================================================
-- MIGRACIÓN: AGREGAR EMBEDDINGS A RESPONSE_LEARNING
-- =====================================================
-- Agrega soporte para búsqueda semántica usando embeddings
-- en Pinecone para las respuestas aprendidas
--
-- Fecha: 2024
-- =====================================================

-- Agregar columna embedding_id para almacenar el ID del vector en Pinecone
ALTER TABLE response_learning 
ADD COLUMN IF NOT EXISTS embedding_id TEXT;

COMMENT ON COLUMN response_learning.embedding_id IS 'ID del vector en Pinecone (namespace: learned_responses) para búsqueda semántica';

-- Índice para búsquedas por embedding_id
CREATE INDEX IF NOT EXISTS idx_response_learning_embedding_id ON response_learning(embedding_id) WHERE embedding_id IS NOT NULL;

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================

