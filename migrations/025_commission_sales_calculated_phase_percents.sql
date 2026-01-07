-- =====================================================
-- CAPITAL PLUS AI AGENT - PORCENTAJES DE FASE ESTÁTICOS
-- =====================================================
-- Migración para guardar los porcentajes de fase usados
-- cuando se calculó la comisión, para que queden estáticos
-- y no cambien aunque se actualice la configuración
--
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/025_commission_sales_calculated_phase_percents.sql
-- =====================================================

-- =====================================================
-- PASO 1: Agregar campos para guardar porcentajes de fase calculados
-- =====================================================

ALTER TABLE commission_sales
ADD COLUMN IF NOT EXISTS calculated_phase_sale_percent DECIMAL(5, 2)
CHECK (calculated_phase_sale_percent IS NULL OR (calculated_phase_sale_percent >= 0 AND calculated_phase_sale_percent <= 100));

ALTER TABLE commission_sales
ADD COLUMN IF NOT EXISTS calculated_phase_post_sale_percent DECIMAL(5, 2)
CHECK (calculated_phase_post_sale_percent IS NULL OR (calculated_phase_post_sale_percent >= 0 AND calculated_phase_post_sale_percent <= 100));

-- Comentarios para los nuevos campos
COMMENT ON COLUMN commission_sales.calculated_phase_sale_percent IS 'Porcentaje de fase venta usado cuando se calculó la comisión. Se guarda estático para que no cambie aunque se actualice la configuración.';
COMMENT ON COLUMN commission_sales.calculated_phase_post_sale_percent IS 'Porcentaje de fase postventa usado cuando se calculó la comisión. Se guarda estático para que no cambie aunque se actualice la configuración.';

-- Índices para los nuevos campos (opcional, pero útil para consultas)
CREATE INDEX IF NOT EXISTS idx_commission_sales_calculated_phase_sale_percent ON commission_sales(calculated_phase_sale_percent);
CREATE INDEX IF NOT EXISTS idx_commission_sales_calculated_phase_post_sale_percent ON commission_sales(calculated_phase_post_sale_percent);

