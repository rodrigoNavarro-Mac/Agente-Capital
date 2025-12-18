-- =====================================================
-- MIGRACIÓN: Comisiones - 3 Decimales y Separación por Fases
-- =====================================================
-- Descripción: 
-- 1. Cambia todos los porcentajes de DECIMAL(5,2) a DECIMAL(6,3) para permitir 3 decimales
-- 2. Reorganiza la configuración global para separar por fases
-- 3. Mueve Atención a Clientes y Entregas a fase venta en configuración por desarrollo
-- Fecha: 2025-01-XX
-- =====================================================

-- =====================================================
-- PASO 1: Actualizar tipos DECIMAL en commission_configs
-- =====================================================
ALTER TABLE commission_configs
  ALTER COLUMN phase_sale_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN phase_post_sale_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN sale_pool_total_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN sale_manager_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN deal_owner_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN external_advisor_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN operations_coordinator_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN marketing_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN legal_manager_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN post_sale_coordinator_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN customer_service_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN deliveries_percent TYPE DECIMAL(6, 3),
  ALTER COLUMN bonds_percent TYPE DECIMAL(6, 3);

-- =====================================================
-- PASO 2: Actualizar tipos DECIMAL en commission_global_configs
-- =====================================================
ALTER TABLE commission_global_configs
  ALTER COLUMN config_value TYPE DECIMAL(6, 3);

-- =====================================================
-- PASO 3: Verificar/Crear tabla commission_rules y actualizar tipos DECIMAL
-- =====================================================
-- Asegurar que la tabla commission_rules exista con la estructura correcta
CREATE TABLE IF NOT EXISTS commission_rules (
    id SERIAL PRIMARY KEY,
    desarrollo VARCHAR(255) NOT NULL,
    rule_name VARCHAR(500) NOT NULL,
    periodo_type VARCHAR(20) NOT NULL CHECK (periodo_type IN ('trimestre', 'mensual', 'anual')),
    periodo_value VARCHAR(50) NOT NULL,
    operador VARCHAR(10) NOT NULL CHECK (operador IN ('=', '>=', '<=')),
    unidades_vendidas INTEGER NOT NULL CHECK (unidades_vendidas > 0),
    porcentaje_comision DECIMAL(6, 3) NOT NULL CHECK (porcentaje_comision >= 0 AND porcentaje_comision <= 100),
    porcentaje_iva DECIMAL(6, 3) NOT NULL DEFAULT 0 CHECK (porcentaje_iva >= 0 AND porcentaje_iva <= 100),
    activo BOOLEAN DEFAULT TRUE,
    prioridad INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agregar columnas faltantes si la tabla ya existía pero no tenía todas las columnas
DO $$ 
BEGIN
    -- Agregar periodo_type si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'periodo_type') THEN
        ALTER TABLE commission_rules ADD COLUMN periodo_type VARCHAR(20) NOT NULL DEFAULT 'mensual';
        ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_periodo_type_check 
            CHECK (periodo_type IN ('trimestre', 'mensual', 'anual'));
    END IF;
    
    -- Agregar periodo_value si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'periodo_value') THEN
        ALTER TABLE commission_rules ADD COLUMN periodo_value VARCHAR(50) NOT NULL DEFAULT '';
    END IF;
    
    -- Agregar rule_name si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'rule_name') THEN
        ALTER TABLE commission_rules ADD COLUMN rule_name VARCHAR(500) NOT NULL DEFAULT '';
    END IF;
    
    -- Agregar operador si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'operador') THEN
        ALTER TABLE commission_rules ADD COLUMN operador VARCHAR(10) NOT NULL DEFAULT '=';
        ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_operador_check 
            CHECK (operador IN ('=', '>=', '<='));
    END IF;
    
    -- Agregar unidades_vendidas si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'unidades_vendidas') THEN
        ALTER TABLE commission_rules ADD COLUMN unidades_vendidas INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_unidades_vendidas_check 
            CHECK (unidades_vendidas > 0);
    END IF;
    
    -- Agregar porcentaje_iva si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commission_rules' AND column_name = 'porcentaje_iva') THEN
        ALTER TABLE commission_rules ADD COLUMN porcentaje_iva DECIMAL(6, 3) NOT NULL DEFAULT 0;
        ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_porcentaje_iva_check 
            CHECK (porcentaje_iva >= 0 AND porcentaje_iva <= 100);
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
END $$;

-- Actualizar tipos DECIMAL en commission_rules (solo si las columnas existen)
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

-- =====================================================
-- PASO 4: Actualizar tipos DECIMAL en commission_distributions y permitir fase 'utility'
-- =====================================================
ALTER TABLE commission_distributions
  ALTER COLUMN percent_assigned TYPE DECIMAL(6, 3);

-- Actualizar constraint de phase para permitir 'utility' (utilidad de reglas)
ALTER TABLE commission_distributions
  DROP CONSTRAINT IF EXISTS commission_distributions_phase_check;

ALTER TABLE commission_distributions
  ADD CONSTRAINT commission_distributions_phase_check 
  CHECK (phase IN ('sale', 'post_sale', 'utility'));

-- =====================================================
-- PASO 5: Reorganizar configuración global por fases
-- =====================================================
-- Agregar nuevos campos para fase postventa en configuración global
-- Nota: Los campos de fase venta ya existen (operations_coordinator_percent, marketing_percent)
-- Necesitamos agregar campos para fase postventa: legal_manager_percent, post_sale_coordinator_percent

-- Actualizar commission_global_configs para incluir configuraciones de fase postventa
-- Usar INSERT condicional para evitar errores si ya existen
INSERT INTO commission_global_configs (config_key, config_value, description)
SELECT 'legal_manager_percent', 0, 'Porcentaje global para Gerente Legal (Fase Postventa)'
WHERE NOT EXISTS (SELECT 1 FROM commission_global_configs WHERE config_key = 'legal_manager_percent');

INSERT INTO commission_global_configs (config_key, config_value, description)
SELECT 'post_sale_coordinator_percent', 0, 'Porcentaje global para Coordinador Postventas (Fase Postventa)'
WHERE NOT EXISTS (SELECT 1 FROM commission_global_configs WHERE config_key = 'post_sale_coordinator_percent');

-- =====================================================
-- PASO 6: Reorganizar configuración por desarrollo
-- =====================================================
-- Mover customer_service y deliveries a fase venta
-- Agregar campos para indicar si están en fase venta o postventa
-- Por ahora, mantenemos la estructura actual pero agregamos comentarios

-- Nota: Los campos customer_service y deliveries se moverán a fase venta
-- en la lógica de la aplicación, no necesitamos cambiar la estructura de BD
-- ya que el campo 'phase' en commission_distributions ya indica la fase

-- =====================================================
-- PASO 7: Agregar campo pool_enabled para indicar si el pool está activo
-- =====================================================
ALTER TABLE commission_configs
  ADD COLUMN IF NOT EXISTS pool_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN commission_configs.pool_enabled IS 'Indica si el pool está habilitado (solo si se cumplen reglas)';

-- =====================================================
-- PASO 8: Nota sobre Atención a Clientes y Entregas
-- =====================================================
-- Atención a Clientes y Entregas están en Fase Postventa
-- Los campos customer_service_enabled, customer_service_percent,
-- deliveries_enabled y deliveries_percent ya existen en la tabla
-- y se usan para la fase postventa

-- =====================================================
-- NOTAS IMPORTANTES:
-- =====================================================
-- 1. Los porcentajes ahora aceptan hasta 3 decimales (ej: 12.345%)
-- 2. La configuración global está separada por fases:
--    - Fase Venta: operations_coordinator_percent, marketing_percent
--    - Fase Postventa: legal_manager_percent, post_sale_coordinator_percent
-- 3. Atención a Clientes y Entregas están en Fase Postventa
--    - Fase Postventa: customer_service_enabled, deliveries_enabled (existente)
-- 4. El pool solo se aplica si pool_enabled = true y se cumplen las reglas
-- =====================================================

