-- =====================================================
-- MIGRACIÓN: Fix Commission Rules Columns
-- =====================================================
-- Descripción: Asegura que todas las columnas necesarias existan en commission_rules
-- Fecha: 2025-01-XX
-- =====================================================

-- Asegurar que la tabla commission_rules exista
CREATE TABLE IF NOT EXISTS commission_rules (
    id SERIAL PRIMARY KEY,
    desarrollo VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agregar todas las columnas necesarias si no existen
DO $$ 
BEGIN
    -- Agregar rule_name si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'rule_name') THEN
        ALTER TABLE commission_rules ADD COLUMN rule_name VARCHAR(500) NOT NULL DEFAULT '';
    END IF;
    
    -- Agregar periodo_type si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'periodo_type') THEN
        ALTER TABLE commission_rules ADD COLUMN periodo_type VARCHAR(20) NOT NULL DEFAULT 'mensual';
    END IF;
    
    -- Agregar periodo_value si no existe (ESTA ES LA COLUMNA FALTANTE)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'periodo_value') THEN
        ALTER TABLE commission_rules ADD COLUMN periodo_value VARCHAR(50) NOT NULL DEFAULT '';
    END IF;
    
    -- Agregar operador si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'operador') THEN
        ALTER TABLE commission_rules ADD COLUMN operador VARCHAR(10) NOT NULL DEFAULT '=';
    END IF;
    
    -- Agregar unidades_vendidas si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'unidades_vendidas') THEN
        ALTER TABLE commission_rules ADD COLUMN unidades_vendidas INTEGER NOT NULL DEFAULT 1;
    END IF;
    
    -- Agregar porcentaje_comision si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'porcentaje_comision') THEN
        ALTER TABLE commission_rules ADD COLUMN porcentaje_comision DECIMAL(6, 3) NOT NULL DEFAULT 0;
    END IF;
    
    -- Agregar porcentaje_iva si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'porcentaje_iva') THEN
        ALTER TABLE commission_rules ADD COLUMN porcentaje_iva DECIMAL(6, 3) NOT NULL DEFAULT 0;
    END IF;
    
    -- Agregar activo si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'activo') THEN
        ALTER TABLE commission_rules ADD COLUMN activo BOOLEAN DEFAULT TRUE;
    END IF;
    
    -- Agregar prioridad si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'prioridad') THEN
        ALTER TABLE commission_rules ADD COLUMN prioridad INTEGER DEFAULT 0;
    END IF;
    
    -- Agregar created_by si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'created_by') THEN
        ALTER TABLE commission_rules ADD COLUMN created_by INTEGER REFERENCES users(id);
    END IF;
    
    -- Agregar updated_by si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'updated_by') THEN
        ALTER TABLE commission_rules ADD COLUMN updated_by INTEGER REFERENCES users(id);
    END IF;
END $$;

-- Actualizar tipos DECIMAL a (6,3) si existen
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'commission_rules' AND column_name = 'porcentaje_comision') THEN
        ALTER TABLE commission_rules ALTER COLUMN porcentaje_comision TYPE DECIMAL(6, 3);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'commission_rules' AND column_name = 'porcentaje_iva') THEN
        ALTER TABLE commission_rules ALTER COLUMN porcentaje_iva TYPE DECIMAL(6, 3);
    END IF;
END $$;

-- Agregar constraints si no existen
DO $$ 
BEGIN
    -- Constraint para periodo_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'commission_rules' 
        AND constraint_name = 'commission_rules_periodo_type_check'
    ) THEN
        ALTER TABLE commission_rules 
        ADD CONSTRAINT commission_rules_periodo_type_check 
        CHECK (periodo_type IN ('trimestre', 'mensual', 'anual'));
    END IF;
    
    -- Constraint para operador
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'commission_rules' 
        AND constraint_name = 'commission_rules_operador_check'
    ) THEN
        ALTER TABLE commission_rules 
        ADD CONSTRAINT commission_rules_operador_check 
        CHECK (operador IN ('=', '>=', '<='));
    END IF;
    
    -- Constraint para unidades_vendidas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'commission_rules' 
        AND constraint_name = 'commission_rules_unidades_vendidas_check'
    ) THEN
        ALTER TABLE commission_rules 
        ADD CONSTRAINT commission_rules_unidades_vendidas_check 
        CHECK (unidades_vendidas > 0);
    END IF;
    
    -- Constraint para porcentaje_comision
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'commission_rules' 
        AND constraint_name = 'commission_rules_porcentaje_comision_check'
    ) THEN
        ALTER TABLE commission_rules 
        ADD CONSTRAINT commission_rules_porcentaje_comision_check 
        CHECK (porcentaje_comision >= 0 AND porcentaje_comision <= 100);
    END IF;
    
    -- Constraint para porcentaje_iva
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'commission_rules' 
        AND constraint_name = 'commission_rules_porcentaje_iva_check'
    ) THEN
        ALTER TABLE commission_rules 
        ADD CONSTRAINT commission_rules_porcentaje_iva_check 
        CHECK (porcentaje_iva >= 0 AND porcentaje_iva <= 100);
    END IF;
END $$;

-- Crear índices si no existen
CREATE INDEX IF NOT EXISTS idx_commission_rules_desarrollo ON commission_rules(desarrollo);
CREATE INDEX IF NOT EXISTS idx_commission_rules_periodo ON commission_rules(periodo_type, periodo_value);
CREATE INDEX IF NOT EXISTS idx_commission_rules_activo ON commission_rules(activo);
CREATE INDEX IF NOT EXISTS idx_commission_rules_prioridad ON commission_rules(prioridad DESC);

-- Crear trigger para updated_at si no existe
CREATE OR REPLACE FUNCTION update_commission_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_commission_rules_updated_at ON commission_rules;
CREATE TRIGGER trigger_update_commission_rules_updated_at
    BEFORE UPDATE ON commission_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_rules_updated_at();

-- Comentarios
COMMENT ON TABLE commission_rules IS 'Reglas de comisión por desarrollo basadas en unidades vendidas';
COMMENT ON COLUMN commission_rules.periodo_type IS 'Tipo de período: trimestre, mensual, anual';
COMMENT ON COLUMN commission_rules.periodo_value IS 'Valor del período: "2025-Q1" (trimestre), "2025-01" (mensual), "2025" (anual)';
COMMENT ON COLUMN commission_rules.operador IS 'Operador de comparación: =, >=, <=';
COMMENT ON COLUMN commission_rules.unidades_vendidas IS 'Número de unidades vendidas (Producto) para aplicar la regla';
COMMENT ON COLUMN commission_rules.porcentaje_comision IS 'Porcentaje de comisión sobre el valor de la venta';
COMMENT ON COLUMN commission_rules.porcentaje_iva IS 'Porcentaje de IVA adicional sobre la comisión';
COMMENT ON COLUMN commission_rules.prioridad IS 'Prioridad de la regla (mayor número = mayor prioridad)';

