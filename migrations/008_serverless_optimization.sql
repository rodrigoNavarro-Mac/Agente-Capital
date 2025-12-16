-- =====================================================
-- MIGRACIÓN 008: OPTIMIZACIÓN PARA SERVERLESS
-- =====================================================
-- 
-- Esta migración agrega índices necesarios para:
-- 1. Keyset pagination (cursor-based) en lugar de OFFSET
-- 2. Mejor rendimiento en queries frecuentes
-- 3. Reducción de latencia en serverless
--
-- ÍNDICES CREADOS:
-- - zoho_leads: modified_time DESC, id (para keyset pagination)
-- - zoho_deals: modified_time DESC, id (para keyset pagination)
-- - documents_meta: created_at DESC, id (para keyset pagination)
-- - action_logs: created_at DESC, id (para keyset pagination)
-- - query_logs: created_at DESC, id (para keyset pagination)
--
-- NOTA: Estos índices son críticos para keyset pagination
-- y reducen la latencia de O(n) a O(log n)

BEGIN;

-- =====================================================
-- ÍNDICES PARA ZOHO LEADS (Keyset Pagination)
-- =====================================================

-- Índice compuesto para keyset pagination por modified_time
-- Permite ORDER BY modified_time DESC, id DESC con WHERE id > cursor
CREATE INDEX IF NOT EXISTS idx_zoho_leads_modified_time_id_desc 
ON zoho_leads (modified_time DESC, id DESC);

-- Índice para búsqueda por desarrollo (filtro común)
CREATE INDEX IF NOT EXISTS idx_zoho_leads_desarrollo 
ON zoho_leads (desarrollo) 
WHERE desarrollo IS NOT NULL;

-- Índice para búsqueda por created_time (si se usa como cursor alternativo)
CREATE INDEX IF NOT EXISTS idx_zoho_leads_created_time_id_desc 
ON zoho_leads (created_time DESC, id DESC);

-- =====================================================
-- ÍNDICES PARA ZOHO DEALS (Keyset Pagination)
-- =====================================================

-- Índice compuesto para keyset pagination por modified_time
CREATE INDEX IF NOT EXISTS idx_zoho_deals_modified_time_id_desc 
ON zoho_deals (modified_time DESC, id DESC);

-- Índice para búsqueda por desarrollo (filtro común)
CREATE INDEX IF NOT EXISTS idx_zoho_deals_desarrollo 
ON zoho_deals (desarrollo) 
WHERE desarrollo IS NOT NULL;

-- Índice para búsqueda por created_time
CREATE INDEX IF NOT EXISTS idx_zoho_deals_created_time_id_desc 
ON zoho_deals (created_time DESC, id DESC);

-- =====================================================
-- ÍNDICES PARA DOCUMENTS_META (Keyset Pagination)
-- =====================================================

-- Índice compuesto para keyset pagination por created_at
CREATE INDEX IF NOT EXISTS idx_documents_meta_created_at_id_desc 
ON documents_meta (created_at DESC, id DESC);

-- Índice para búsqueda por uploaded_by (filtro común)
CREATE INDEX IF NOT EXISTS idx_documents_meta_uploaded_by 
ON documents_meta (uploaded_by) 
WHERE uploaded_by IS NOT NULL;

-- Índice para búsqueda por zone (filtro común)
CREATE INDEX IF NOT EXISTS idx_documents_meta_zone 
ON documents_meta (zone) 
WHERE zone IS NOT NULL;

-- Índice para búsqueda por development (filtro común)
CREATE INDEX IF NOT EXISTS idx_documents_meta_development 
ON documents_meta (development) 
WHERE development IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA ACTION LOGS (Keyset Pagination)
-- =====================================================

-- Índice compuesto para keyset pagination por created_at
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at_id_desc 
ON action_logs (created_at DESC, id DESC);

-- Índice para búsqueda por user_id (filtro común)
CREATE INDEX IF NOT EXISTS idx_action_logs_user_id 
ON action_logs (user_id) 
WHERE user_id IS NOT NULL;

-- Índice para búsqueda por action_type (filtro común)
CREATE INDEX IF NOT EXISTS idx_action_logs_action_type 
ON action_logs (action_type) 
WHERE action_type IS NOT NULL;

-- Índice para búsqueda por resource_type (filtro común)
CREATE INDEX IF NOT EXISTS idx_action_logs_resource_type 
ON action_logs (resource_type) 
WHERE resource_type IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA QUERY LOGS (Keyset Pagination)
-- =====================================================

-- Índice compuesto para keyset pagination por created_at
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at_id_desc 
ON query_logs (created_at DESC, id DESC);

-- Índice para búsqueda por user_id (filtro común)
CREATE INDEX IF NOT EXISTS idx_query_logs_user_id 
ON query_logs (user_id) 
WHERE user_id IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA ZOHO NOTES (Optimización de JOINs)
-- =====================================================

-- Índice para búsqueda rápida de notas por parent
CREATE INDEX IF NOT EXISTS idx_zoho_notes_parent_lookup 
ON zoho_notes (parent_type, parent_id, created_time DESC);

-- =====================================================
-- ANÁLISIS DE ÍNDICES
-- =====================================================

-- Verificar que los índices se crearon correctamente
DO $$
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%_%_desc';
    
    RAISE NOTICE 'Índices creados para keyset pagination: %', index_count;
END $$;

COMMIT;

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- 
-- 1. Estos índices mejoran significativamente el rendimiento
--    de keyset pagination (cursor-based)
--
-- 2. Los índices compuestos (columna DESC, id DESC) permiten:
--    - ORDER BY rápido
--    - WHERE id > cursor eficiente
--    - Latencia constante O(log n) en lugar de O(n)
--
-- 3. Los índices parciales (WHERE columna IS NOT NULL) son más
--    pequeños y eficientes cuando hay muchos NULLs
--
-- 4. Monitorear el tamaño de los índices:
--    SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid))
--    FROM pg_stat_user_indexes
--    WHERE schemaname = 'public'
--    ORDER BY pg_relation_size(indexrelid) DESC;
--
-- 5. Si necesitas eliminar un índice:
--    DROP INDEX IF EXISTS idx_nombre_indice;

