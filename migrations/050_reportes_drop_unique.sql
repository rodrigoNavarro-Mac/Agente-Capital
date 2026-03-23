-- =====================================================
-- MIGRACIÓN 050: Quitar unique constraint de reportes
-- =====================================================
-- Permite múltiples reportes por (desarrollo, periodo) para depuración

ALTER TABLE reportes DROP CONSTRAINT IF EXISTS reportes_desarrollo_periodo_unique;
