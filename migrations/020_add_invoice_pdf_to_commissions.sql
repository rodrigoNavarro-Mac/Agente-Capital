-- =====================================================
-- MIGRACIÓN: Factura PDF en Distribuciones de Comisiones
-- =====================================================
-- Descripción: Agrega campo invoice_pdf_path a commission_distributions
--              para almacenar la ruta del PDF de factura
-- Fecha: 2025-01-XX
-- =====================================================

-- Agregar columna invoice_pdf_path a commission_distributions
ALTER TABLE commission_distributions
ADD COLUMN IF NOT EXISTS invoice_pdf_path VARCHAR(500);

-- Comentario para la nueva columna
COMMENT ON COLUMN commission_distributions.invoice_pdf_path IS 'Ruta del archivo PDF de factura asociado a esta comisión';

-- Índice para búsquedas rápidas por factura
CREATE INDEX IF NOT EXISTS idx_commission_distributions_invoice_pdf 
ON commission_distributions(invoice_pdf_path) 
WHERE invoice_pdf_path IS NOT NULL;

