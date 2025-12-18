-- =====================================================
-- MIGRACIÓN: Fix Commission Distributions Phase Constraint
-- =====================================================
-- Descripción: Actualiza el constraint de phase en commission_distributions
--              para permitir 'utility' como fase válida
-- Fecha: 2025-01-XX
-- =====================================================

-- Eliminar el constraint antiguo si existe
ALTER TABLE commission_distributions
  DROP CONSTRAINT IF EXISTS commission_distributions_phase_check;

-- Crear el constraint actualizado que incluye 'utility'
ALTER TABLE commission_distributions
  ADD CONSTRAINT commission_distributions_phase_check 
  CHECK (phase IN ('sale', 'post_sale', 'utility'));

COMMENT ON CONSTRAINT commission_distributions_phase_check ON commission_distributions 
IS 'Permite valores: sale (fase venta), post_sale (fase postventa), utility (utilidad de reglas)';

