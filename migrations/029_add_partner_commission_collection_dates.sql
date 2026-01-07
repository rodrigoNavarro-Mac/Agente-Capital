-- =====================================================
-- CAPITAL PLUS AI AGENT - FECHAS DE COBRO POR FASE EN PARTNER_COMMISSIONS
-- =====================================================
-- Migración para agregar campos que guarden las fechas de cobro
-- para cada fase (venta y postventa) en partner_commissions
--
-- Esto permite filtrar por la fecha real de cobro en lugar de calcular
-- la fecha de escrituración dinámicamente
--
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/029_add_partner_commission_collection_dates.sql
-- =====================================================

-- =====================================================
-- PASO 1: Agregar campos de fecha de cobro por fase
-- =====================================================

-- Fecha de cobro para fase venta
ALTER TABLE partner_commissions
ADD COLUMN IF NOT EXISTS sale_phase_collected_at TIMESTAMP WITH TIME ZONE NULL;

-- Fecha de cobro para fase postventa
ALTER TABLE partner_commissions
ADD COLUMN IF NOT EXISTS post_sale_phase_collected_at TIMESTAMP WITH TIME ZONE NULL;

-- =====================================================
-- PASO 2: Agregar índices para búsquedas eficientes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_partner_commissions_sale_phase_collected_at 
ON partner_commissions(sale_phase_collected_at) 
WHERE sale_phase_collected_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_commissions_post_sale_phase_collected_at 
ON partner_commissions(post_sale_phase_collected_at) 
WHERE post_sale_phase_collected_at IS NOT NULL;

-- =====================================================
-- PASO 3: Actualizar comentarios
-- =====================================================

COMMENT ON COLUMN partner_commissions.sale_phase_collected_at IS 'Fecha en que se cobró la comisión de fase venta (se establece cuando sale_phase_collection_status cambia a collected)';
COMMENT ON COLUMN partner_commissions.post_sale_phase_collected_at IS 'Fecha en que se cobró la comisión de fase postventa (se establece cuando post_sale_phase_collection_status cambia a collected)';

-- =====================================================
-- PASO 4: Migrar datos existentes
-- =====================================================

-- Si ya hay comisiones con estado "collected", establecer la fecha de cobro
-- usando updated_at como aproximación (o calculated_at si updated_at no está disponible)
UPDATE partner_commissions
SET sale_phase_collected_at = updated_at
WHERE sale_phase_collection_status = 'collected' 
  AND sale_phase_collected_at IS NULL;

UPDATE partner_commissions
SET post_sale_phase_collected_at = updated_at
WHERE post_sale_phase_collection_status = 'collected' 
  AND post_sale_phase_collected_at IS NULL;

