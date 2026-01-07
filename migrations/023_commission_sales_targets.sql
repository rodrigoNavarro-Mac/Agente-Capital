-- =====================================================
-- MIGRACIÓN: Metas de Ventas para Comisiones
-- =====================================================
-- Descripción: Crea tabla para almacenar metas de ventas
--              por mes y año para el dashboard de comisiones
--              El monto se calcula usando valor_total (sin IVA)
-- Fecha: 2025-01-XX
-- =====================================================

-- =====================================================
-- TABLA: commission_sales_targets
-- Metas de ventas por mes y año
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_sales_targets (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    target_amount DECIMAL(15, 2) NOT NULL CHECK (target_amount >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    UNIQUE(year, month)
);

COMMENT ON TABLE commission_sales_targets IS 'Metas de ventas por mes y año para el dashboard de comisiones';
COMMENT ON COLUMN commission_sales_targets.year IS 'Año de la meta';
COMMENT ON COLUMN commission_sales_targets.month IS 'Mes de la meta (1-12)';
COMMENT ON COLUMN commission_sales_targets.target_amount IS 'Monto objetivo de ventas (valor_total sin IVA) para el mes';

-- Índice para búsquedas rápidas por año y mes
CREATE INDEX IF NOT EXISTS idx_commission_sales_targets_year_month ON commission_sales_targets(year, month);


