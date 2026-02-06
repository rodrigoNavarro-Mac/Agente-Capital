-- Rollback: Eliminar campo estado que se agregó incorrectamente
-- Este campo no debería existir, la funcionalidad debe estar en payment_status

-- Eliminar trigger
DROP TRIGGER IF EXISTS trg_set_amount_zero_on_no_aplica ON commission_distributions;
DROP FUNCTION IF EXISTS set_amount_zero_on_no_aplica();

-- Eliminar índice
DROP INDEX IF EXISTS idx_commission_distributions_estado;

-- Eliminar constraint
ALTER TABLE commission_distributions DROP CONSTRAINT IF EXISTS chk_commission_estado;

-- Eliminar columna
ALTER TABLE commission_distributions DROP COLUMN IF EXISTS estado;
