-- =====================================================
-- MIGRACIÓN: Módulo de Comisiones
-- =====================================================
-- Descripción: Crea tablas para el sistema de comisiones
--              configurable, auditable y flexible
-- Fecha: 2025-01-XX
-- =====================================================

-- =====================================================
-- TABLA: commission_configs
-- Configuración de comisiones por desarrollo
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_configs (
    id SERIAL PRIMARY KEY,
    desarrollo VARCHAR(255) NOT NULL UNIQUE,
    
    -- Porcentajes de fases (deben sumar 100%)
    phase_sale_percent DECIMAL(5, 2) NOT NULL CHECK (phase_sale_percent >= 0 AND phase_sale_percent <= 100),
    phase_post_sale_percent DECIMAL(5, 2) NOT NULL CHECK (phase_post_sale_percent >= 0 AND phase_post_sale_percent <= 100),
    
    -- Fase Venta - Roles directos (pool de ventas)
    sale_pool_total_percent DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (sale_pool_total_percent >= 0 AND sale_pool_total_percent <= 100),
    sale_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (sale_manager_percent >= 0 AND sale_manager_percent <= 100),
    deal_owner_percent DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (deal_owner_percent >= 0 AND deal_owner_percent <= 100),
    external_advisor_percent DECIMAL(5, 2) DEFAULT 0 CHECK (external_advisor_percent >= 0 AND external_advisor_percent <= 100),
    
    -- Fase Venta - Roles indirectos (globales, no dependen del desarrollo)
    -- Estos se configuran globalmente, pero se almacenan aquí para referencia
    operations_coordinator_percent DECIMAL(5, 2) DEFAULT 0 CHECK (operations_coordinator_percent >= 0 AND operations_coordinator_percent <= 100),
    marketing_percent DECIMAL(5, 2) DEFAULT 0 CHECK (marketing_percent >= 0 AND marketing_percent <= 100),
    
    -- Fase Postventa - Roles base (siempre activos)
    legal_manager_percent DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (legal_manager_percent >= 0 AND legal_manager_percent <= 100),
    post_sale_coordinator_percent DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (post_sale_coordinator_percent >= 0 AND post_sale_coordinator_percent <= 100),
    
    -- Fase Postventa - Roles opcionales (dependen del desarrollo)
    customer_service_enabled BOOLEAN DEFAULT false,
    customer_service_percent DECIMAL(5, 2) DEFAULT 0 CHECK (customer_service_percent >= 0 AND customer_service_percent <= 100),
    
    deliveries_enabled BOOLEAN DEFAULT false,
    deliveries_percent DECIMAL(5, 2) DEFAULT 0 CHECK (deliveries_percent >= 0 AND deliveries_percent <= 100),
    
    bonds_enabled BOOLEAN DEFAULT false,
    bonds_percent DECIMAL(5, 2) DEFAULT 0 CHECK (bonds_percent >= 0 AND bonds_percent <= 100),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

COMMENT ON TABLE commission_configs IS 'Configuración de comisiones por desarrollo';
COMMENT ON COLUMN commission_configs.desarrollo IS 'Nombre del desarrollo (debe ser único)';
COMMENT ON COLUMN commission_configs.phase_sale_percent IS 'Porcentaje de comisión para fase venta';
COMMENT ON COLUMN commission_configs.phase_post_sale_percent IS 'Porcentaje de comisión para fase postventa';
COMMENT ON COLUMN commission_configs.sale_pool_total_percent IS 'Porcentaje total del pool de ventas (se reparte entre roles directos)';
COMMENT ON COLUMN commission_configs.external_advisor_percent IS 'Porcentaje para asesor externo (opcional, si no existe se redistribuye)';

-- Índices para commission_configs
CREATE INDEX IF NOT EXISTS idx_commission_configs_desarrollo ON commission_configs(desarrollo);

-- =====================================================
-- TABLA: commission_global_configs
-- Configuración global de roles indirectos
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_global_configs (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value DECIMAL(5, 2) NOT NULL CHECK (config_value >= 0 AND config_value <= 100),
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

COMMENT ON TABLE commission_global_configs IS 'Configuración global de porcentajes para roles indirectos (Operaciones, Marketing)';
COMMENT ON COLUMN commission_global_configs.config_key IS 'Clave de configuración: operations_coordinator_percent, marketing_percent';
COMMENT ON COLUMN commission_global_configs.config_value IS 'Porcentaje global aplicable a todos los desarrollos';

-- Insertar valores por defecto
INSERT INTO commission_global_configs (config_key, config_value, description)
VALUES 
    ('operations_coordinator_percent', 0, 'Porcentaje global para Coordinador de Operaciones de Ventas'),
    ('marketing_percent', 0, 'Porcentaje global para Departamento de Marketing')
ON CONFLICT (config_key) DO NOTHING;

-- =====================================================
-- TABLA: commission_sales
-- Ventas comisionables (deals cerrados-ganados)
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_sales (
    id SERIAL PRIMARY KEY,
    zoho_deal_id VARCHAR(255) UNIQUE NOT NULL, -- ID del deal en Zoho
    deal_name VARCHAR(500),
    
    -- Información de la venta
    cliente_nombre VARCHAR(500) NOT NULL,
    desarrollo VARCHAR(255) NOT NULL,
    propietario_deal VARCHAR(255) NOT NULL, -- Nombre del propietario del deal
    propietario_deal_id VARCHAR(255), -- ID del propietario en Zoho
    plazo_deal VARCHAR(100), -- Plazo del deal
    producto VARCHAR(500), -- Lote + Calle
    metros_cuadrados DECIMAL(10, 2) NOT NULL CHECK (metros_cuadrados > 0),
    precio_por_m2 DECIMAL(15, 2) NOT NULL CHECK (precio_por_m2 >= 0),
    valor_total DECIMAL(15, 2) NOT NULL CHECK (valor_total >= 0),
    fecha_firma DATE NOT NULL,
    
    -- Información adicional del deal
    asesor_externo VARCHAR(255), -- Nombre del asesor externo (opcional)
    asesor_externo_id VARCHAR(255), -- ID del asesor externo en Zoho
    
    -- Estado de la comisión
    commission_calculated BOOLEAN DEFAULT false,
    commission_total DECIMAL(15, 2) DEFAULT 0 CHECK (commission_total >= 0),
    commission_sale_phase DECIMAL(15, 2) DEFAULT 0 CHECK (commission_sale_phase >= 0),
    commission_post_sale_phase DECIMAL(15, 2) DEFAULT 0 CHECK (commission_post_sale_phase >= 0),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_from_zoho_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE commission_sales IS 'Ventas comisionables (solo deals cerrados-ganados)';
COMMENT ON COLUMN commission_sales.zoho_deal_id IS 'ID del deal en Zoho CRM';
COMMENT ON COLUMN commission_sales.precio_por_m2 IS 'Calculado automáticamente: valor_total / metros_cuadrados';
COMMENT ON COLUMN commission_sales.commission_calculated IS 'Indica si la comisión ya fue calculada';

-- Índices para commission_sales
CREATE INDEX IF NOT EXISTS idx_commission_sales_desarrollo ON commission_sales(desarrollo);
CREATE INDEX IF NOT EXISTS idx_commission_sales_fecha_firma ON commission_sales(fecha_firma);
CREATE INDEX IF NOT EXISTS idx_commission_sales_propietario ON commission_sales(propietario_deal);
CREATE INDEX IF NOT EXISTS idx_commission_sales_zoho_deal_id ON commission_sales(zoho_deal_id);
CREATE INDEX IF NOT EXISTS idx_commission_sales_calculated ON commission_sales(commission_calculated);

-- =====================================================
-- TABLA: commission_distributions
-- Distribución de comisiones por venta y rol
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_distributions (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES commission_sales(id) ON DELETE CASCADE,
    
    -- Información del rol/persona
    role_type VARCHAR(100) NOT NULL, -- 'sale_manager', 'deal_owner', 'external_advisor', 'operations_coordinator', 'marketing', 'legal_manager', 'post_sale_coordinator', 'customer_service', 'deliveries', 'bonds'
    person_name VARCHAR(255) NOT NULL, -- Nombre de la persona
    person_id VARCHAR(255), -- ID en Zoho o sistema externo
    
    -- Información de la distribución
    phase VARCHAR(50) NOT NULL CHECK (phase IN ('sale', 'post_sale')),
    percent_assigned DECIMAL(5, 2) NOT NULL CHECK (percent_assigned >= 0 AND percent_assigned <= 100),
    amount_calculated DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (amount_calculated >= 0),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE commission_distributions IS 'Distribución de comisiones por venta y rol';
COMMENT ON COLUMN commission_distributions.role_type IS 'Tipo de rol: sale_manager, deal_owner, external_advisor, etc.';
COMMENT ON COLUMN commission_distributions.phase IS 'Fase: sale (venta) o post_sale (postventa)';
COMMENT ON COLUMN commission_distributions.percent_assigned IS 'Porcentaje asignado a este rol';
COMMENT ON COLUMN commission_distributions.amount_calculated IS 'Monto calculado en base al porcentaje';

-- Índices para commission_distributions
CREATE INDEX IF NOT EXISTS idx_commission_distributions_sale_id ON commission_distributions(sale_id);
CREATE INDEX IF NOT EXISTS idx_commission_distributions_role_type ON commission_distributions(role_type);
CREATE INDEX IF NOT EXISTS idx_commission_distributions_phase ON commission_distributions(phase);
CREATE INDEX IF NOT EXISTS idx_commission_distributions_person_name ON commission_distributions(person_name);

-- =====================================================
-- TABLA: commission_adjustments
-- Historial de ajustes manuales a las comisiones
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_adjustments (
    id SERIAL PRIMARY KEY,
    distribution_id INTEGER NOT NULL REFERENCES commission_distributions(id) ON DELETE CASCADE,
    sale_id INTEGER NOT NULL REFERENCES commission_sales(id) ON DELETE CASCADE,
    
    -- Información del ajuste
    adjustment_type VARCHAR(50) NOT NULL CHECK (adjustment_type IN ('percent_change', 'amount_change', 'role_change')),
    old_value DECIMAL(15, 2), -- Valor anterior (porcentaje o monto según el tipo)
    new_value DECIMAL(15, 2) NOT NULL, -- Valor nuevo
    old_role_type VARCHAR(100), -- Rol anterior (si cambió el rol)
    new_role_type VARCHAR(100), -- Rol nuevo (si cambió el rol)
    
    -- Impacto en monto
    amount_impact DECIMAL(15, 2) NOT NULL, -- Diferencia en el monto (puede ser negativo)
    
    -- Metadata de auditoría
    adjusted_by INTEGER NOT NULL REFERENCES users(id),
    adjusted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason TEXT, -- Razón del ajuste
    notes TEXT -- Notas adicionales
);

COMMENT ON TABLE commission_adjustments IS 'Historial de ajustes manuales a las comisiones (auditoría completa)';
COMMENT ON COLUMN commission_adjustments.adjustment_type IS 'Tipo de ajuste: percent_change, amount_change, role_change';
COMMENT ON COLUMN commission_adjustments.amount_impact IS 'Impacto en el monto (diferencia entre valor anterior y nuevo)';

-- Índices para commission_adjustments
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_distribution_id ON commission_adjustments(distribution_id);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_sale_id ON commission_adjustments(sale_id);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_adjusted_by ON commission_adjustments(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_adjusted_at ON commission_adjustments(adjusted_at);

-- =====================================================
-- FUNCIONES: Actualizar updated_at automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_commission_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_commission_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_commission_distributions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_commission_configs_updated_at ON commission_configs;
CREATE TRIGGER trigger_update_commission_configs_updated_at
    BEFORE UPDATE ON commission_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_configs_updated_at();

DROP TRIGGER IF EXISTS trigger_update_commission_sales_updated_at ON commission_sales;
CREATE TRIGGER trigger_update_commission_sales_updated_at
    BEFORE UPDATE ON commission_sales
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_sales_updated_at();

DROP TRIGGER IF EXISTS trigger_update_commission_distributions_updated_at ON commission_distributions;
CREATE TRIGGER trigger_update_commission_distributions_updated_at
    BEFORE UPDATE ON commission_distributions
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_distributions_updated_at();

-- =====================================================
-- NOTA: Los porcentajes de fase venta y postventa
-- NO necesitan sumar 100%. Son porcentajes independientes
-- que se aplican sobre el valor total de la venta.
-- =====================================================

