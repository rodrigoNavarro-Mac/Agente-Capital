-- =====================================================
-- MIGRACIÓN: Campo Estado en Comisiones por Pagar
-- =====================================================
-- Descripción: Agrega campo estado a commission_distributions
--              para controlar si una comisión aplica o no
-- Fecha: 2026-02-06
-- =====================================================

-- Agregar columna estado a commission_distributions
ALTER TABLE commission_distributions
  ADD COLUMN IF NOT EXISTS estado VARCHAR(50) NOT NULL DEFAULT 'SOLICITADA';

-- Agregar constraint para validar valores permitidos
ALTER TABLE commission_distributions
  DROP CONSTRAINT IF EXISTS commission_distributions_estado_check;

ALTER TABLE commission_distributions
  ADD CONSTRAINT commission_distributions_estado_check 
  CHECK (estado IN ('SOLICITADA', 'NO_APLICA'));

-- Comentario en la columna
COMMENT ON COLUMN commission_distributions.estado IS 'Estado de la comisión: SOLICITADA (por defecto) o NO_APLICA (excluida de cálculos)';

-- Crear índice para optimizar filtrados por estado
CREATE INDEX IF NOT EXISTS idx_commission_distributions_estado 
ON commission_distributions(estado);

-- Crear índice compuesto para optimizar consultas de comisiones activas
CREATE INDEX IF NOT EXISTS idx_commission_distributions_sale_estado 
ON commission_distributions(sale_id, estado);

-- =====================================================
-- TRIGGER: Actualizar amount_calculated cuando estado = NO_APLICA
-- =====================================================

-- Función del trigger
CREATE OR REPLACE FUNCTION update_commission_distribution_amount_on_estado_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el estado cambia a NO_APLICA, establecer amount_calculated en 0
    IF NEW.estado = 'NO_APLICA' AND (OLD.estado IS NULL OR OLD.estado != 'NO_APLICA') THEN
        NEW.amount_calculated = 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger
DROP TRIGGER IF EXISTS trigger_update_amount_on_estado_change ON commission_distributions;
CREATE TRIGGER trigger_update_amount_on_estado_change
    BEFORE UPDATE ON commission_distributions
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_distribution_amount_on_estado_change();

-- =====================================================
-- NOTA: Los registros existentes tendrán estado = 'SOLICITADA'
-- por defecto, por lo que no se verán afectados.
-- =====================================================
