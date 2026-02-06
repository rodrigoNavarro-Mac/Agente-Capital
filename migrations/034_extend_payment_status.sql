-- Modificar payment_status para incluir nuevos estados SOLICITADA y NO_APLICA
-- En lugar de crear un campo separado, extendemos el campo existente

-- Primero, eliminar el constraint existente de payment_status
ALTER TABLE commission_distributions DROP CONSTRAINT IF EXISTS commission_distributions_payment_status_check;

-- Agregar nuevo constraint con los 4 valores posibles
ALTER TABLE commission_distributions 
ADD CONSTRAINT commission_distributions_payment_status_check 
CHECK (payment_status IN ('pending', 'paid', 'SOLICITADA', 'NO_APLICA'));

-- Crear trigger para establecer amount_calculated en 0 cuando payment_status = 'NO_APLICA'
CREATE OR REPLACE FUNCTION set_amount_zero_on_no_aplica()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'NO_APLICA' THEN
    NEW.amount_calculated := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_amount_zero_on_no_aplica
BEFORE INSERT OR UPDATE OF payment_status ON commission_distributions
FOR EACH ROW
EXECUTE FUNCTION set_amount_zero_on_no_aplica();

-- Actualizar índice para payment_status (ya debería existir, pero por si acaso)
CREATE INDEX IF NOT EXISTS idx_commission_distributions_payment_status 
ON commission_distributions(payment_status);

-- Comentarios
COMMENT ON COLUMN commission_distributions.payment_status IS 'Estado de la comisión: pending (pendiente de pago), paid (pagada), SOLICITADA (solicitada/aprobada), NO_APLICA (no aplica - monto automático 0)';
