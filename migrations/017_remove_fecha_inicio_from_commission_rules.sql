-- =====================================================
-- MIGRACIÓN: Remover fecha_inicio de commission_rules
-- =====================================================
-- Descripción: Las reglas de comisión no requieren fecha_inicio,
--              solo usan el período (trimestre, mensual, anual) para
--              medir el cumplimiento en cada período.
-- Fecha: 2025-12-18
-- =====================================================

-- Eliminar la columna fecha_inicio si existe
DO $$ 
BEGIN
    -- Verificar si la columna existe antes de eliminarla
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'commission_rules' 
        AND column_name = 'fecha_inicio'
    ) THEN
        ALTER TABLE commission_rules DROP COLUMN fecha_inicio;
        RAISE NOTICE 'Columna fecha_inicio eliminada de commission_rules';
    ELSE
        RAISE NOTICE 'Columna fecha_inicio no existe en commission_rules';
    END IF;
END $$;

-- También eliminar fecha_fin si existe (por si acaso)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'commission_rules' 
        AND column_name = 'fecha_fin'
    ) THEN
        ALTER TABLE commission_rules DROP COLUMN fecha_fin;
        RAISE NOTICE 'Columna fecha_fin eliminada de commission_rules';
    END IF;
END $$;

COMMENT ON TABLE commission_rules IS 'Reglas de comisión por desarrollo basadas en unidades vendidas. Las reglas se aplican según el período (trimestre, mensual, anual) sin necesidad de fecha de inicio/fin.';

