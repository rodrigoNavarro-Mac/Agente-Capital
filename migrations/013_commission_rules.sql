-- =====================================================
-- MIGRACIÓN: Reglas de Comisiones por Desarrollo
-- =====================================================
-- Permite crear reglas de comisión basadas en:
-- - Período (trimestre, mensual, anual)
-- - Operador de comparación (=, >=, <=)
-- - Unidades vendidas (Producto)
-- - Porcentaje de comisión + IVA
-- IMPORTANTE: Todas las reglas aplicables se respetan (no solo una)
-- =====================================================

-- =====================================================
-- TABLA: commission_rules
-- Reglas de comisión por desarrollo
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_rules (
    id SERIAL PRIMARY KEY,
    desarrollo VARCHAR(255) NOT NULL,
    rule_name VARCHAR(500) NOT NULL, -- Nombre descriptivo de la regla
    periodo_type VARCHAR(20) NOT NULL CHECK (periodo_type IN ('trimestre', 'mensual', 'anual')),
    periodo_value VARCHAR(50) NOT NULL, -- Formato: "2025-Q1" (trimestre), "2025-01" (mensual), "2025" (anual)
    operador VARCHAR(10) NOT NULL CHECK (operador IN ('=', '>=', '<=')),
    unidades_vendidas INTEGER NOT NULL CHECK (unidades_vendidas > 0),
    porcentaje_comision DECIMAL(5, 2) NOT NULL CHECK (porcentaje_comision >= 0 AND porcentaje_comision <= 100),
    porcentaje_iva DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (porcentaje_iva >= 0 AND porcentaje_iva <= 100),
    activo BOOLEAN DEFAULT TRUE,
    prioridad INTEGER DEFAULT 0, -- Para ordenar reglas en visualización (todas las reglas aplicables se respetan)
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE commission_rules IS 'Reglas de comisión por desarrollo basadas en unidades vendidas';
COMMENT ON COLUMN commission_rules.periodo_type IS 'Tipo de período: trimestre, mensual, anual';
COMMENT ON COLUMN commission_rules.periodo_value IS 'Valor del período: "2025-Q1" (trimestre), "2025-01" (mensual), "2025" (anual)';
COMMENT ON COLUMN commission_rules.operador IS 'Operador de comparación: =, >=, <=';
COMMENT ON COLUMN commission_rules.unidades_vendidas IS 'Número de unidades vendidas (Producto) para aplicar la regla';
COMMENT ON COLUMN commission_rules.porcentaje_comision IS 'Porcentaje de comisión sobre el valor de la venta';
COMMENT ON COLUMN commission_rules.porcentaje_iva IS 'Porcentaje de IVA adicional sobre la comisión';
COMMENT ON COLUMN commission_rules.prioridad IS 'Prioridad de la regla (mayor número = mayor prioridad)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_commission_rules_desarrollo ON commission_rules(desarrollo);
CREATE INDEX IF NOT EXISTS idx_commission_rules_periodo ON commission_rules(periodo_type, periodo_value);
CREATE INDEX IF NOT EXISTS idx_commission_rules_activo ON commission_rules(activo);
CREATE INDEX IF NOT EXISTS idx_commission_rules_prioridad ON commission_rules(prioridad DESC);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_commission_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_commission_rules_updated_at
    BEFORE UPDATE ON commission_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_rules_updated_at();

