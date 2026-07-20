-- =====================================================
-- MIGRACIÓN: Marcar ventas comisionables como "perdidas"
-- =====================================================
-- Descripción: en vez de borrar una venta comisionable cuando el deal
-- correspondiente pasa a "Cerrado Perdido" en Zoho, se marca con un flag
-- para preservar el historial/auditoría. Las distribuciones pendientes
-- se pasan a NO_APLICA (mismo mecanismo ya usado para excluir montos de
-- los cálculos, ver migración 034_extend_payment_status.sql), lo cual ya
-- zerea amount_calculated vía el trigger existente.
-- Fecha: 2026-07-20
-- =====================================================

ALTER TABLE commission_sales
  ADD COLUMN IF NOT EXISTS is_lost BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE commission_sales
  ADD COLUMN IF NOT EXISTS lost_detected_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN commission_sales.is_lost IS 'true si el deal correspondiente en Zoho pasó a Cerrado Perdido despues de haber sido comisionable';
COMMENT ON COLUMN commission_sales.lost_detected_at IS 'Fecha en que se detectó el cambio a Cerrado Perdido y se marcó la venta';

CREATE INDEX IF NOT EXISTS idx_commission_sales_is_lost ON commission_sales(is_lost);
