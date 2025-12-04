-- =====================================================
-- MIGRACIÓN: Agregar columna feedback_rating a query_logs
-- =====================================================
-- Esta migración agrega las columnas de feedback si no existen
-- Es segura de ejecutar múltiples veces (usa IF NOT EXISTS)
--
-- Fecha: 2024
-- =====================================================

-- Verificar y agregar columna feedback_rating si no existe
DO $$
BEGIN
    -- Agregar feedback_rating si no existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'query_logs' 
        AND column_name = 'feedback_rating'
    ) THEN
        ALTER TABLE query_logs 
        ADD COLUMN feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5);
        
        COMMENT ON COLUMN query_logs.feedback_rating IS 'Calificación del usuario (1-5)';
        
        RAISE NOTICE 'Columna feedback_rating agregada a query_logs';
    ELSE
        RAISE NOTICE 'Columna feedback_rating ya existe en query_logs';
    END IF;

    -- Agregar feedback_comment si no existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'query_logs' 
        AND column_name = 'feedback_comment'
    ) THEN
        ALTER TABLE query_logs 
        ADD COLUMN feedback_comment TEXT;
        
        COMMENT ON COLUMN query_logs.feedback_comment IS 'Comentario del usuario sobre la respuesta';
        
        RAISE NOTICE 'Columna feedback_comment agregada a query_logs';
    ELSE
        RAISE NOTICE 'Columna feedback_comment ya existe en query_logs';
    END IF;
END $$;

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================

