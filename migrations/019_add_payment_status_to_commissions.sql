-- =====================================================
-- MIGRACIÓN: Estado de Pago en Distribuciones de Comisiones
-- =====================================================
-- Descripción: Agrega campo payment_status a commission_distributions
--              para marcar comisiones como pagadas o pendientes
-- Fecha: 2025-01-XX
-- =====================================================

-- Agregar columna payment_status a commission_distributions
ALTER TABLE commission_distributions
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
CHECK (payment_status IN ('pending', 'paid'));

-- Comentario para la nueva columna
COMMENT ON COLUMN commission_distributions.payment_status IS 'Estado de pago: pending (pendiente) o paid (pagado)';

-- Índice para búsquedas rápidas por estado de pago
CREATE INDEX IF NOT EXISTS idx_commission_distributions_payment_status 
ON commission_distributions(payment_status);

-- Índice compuesto para búsquedas por venta y estado de pago
CREATE INDEX IF NOT EXISTS idx_commission_distributions_sale_payment_status 
ON commission_distributions(sale_id, payment_status);

