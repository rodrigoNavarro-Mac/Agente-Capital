-- =====================================================
-- MIGRACIÓN: Eliminar constraint de suma de fases
-- =====================================================
-- Descripción: Elimina el constraint que requería que las fases
--              sumen 100%, ya que los porcentajes son independientes
-- Fecha: 2025-01-XX
-- =====================================================

-- Eliminar el constraint si existe
ALTER TABLE commission_configs
DROP CONSTRAINT IF EXISTS check_phases_sum_100;

COMMENT ON TABLE commission_configs IS 'Configuración de comisiones por desarrollo. Los porcentajes de fase venta y postventa son independientes y NO necesitan sumar 100%';

