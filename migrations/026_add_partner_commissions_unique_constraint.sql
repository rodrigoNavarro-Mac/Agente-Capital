-- =====================================================
-- CAPITAL PLUS AI AGENT - RESTRICCIÓN ÚNICA PARA PARTNER_COMMISSIONS
-- =====================================================
-- Migración para agregar restricción única en (commission_sale_id, socio_name)
-- Esto permite que la función calculate_partner_commissions use ON CONFLICT correctamente
--
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/026_add_partner_commissions_unique_constraint.sql
-- =====================================================

-- =====================================================
-- PASO 1: Agregar restricción única en (commission_sale_id, socio_name)
-- =====================================================

-- Primero, eliminar posibles duplicados si existen
DELETE FROM partner_commissions a
USING partner_commissions b
WHERE a.id < b.id
  AND a.commission_sale_id = b.commission_sale_id
  AND a.socio_name = b.socio_name;

-- Agregar restricción única solo si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_partner_commission_sale_socio'
    ) THEN
        ALTER TABLE partner_commissions
        ADD CONSTRAINT unique_partner_commission_sale_socio 
        UNIQUE (commission_sale_id, socio_name);
    END IF;
END $$;

-- Comentario para la restricción (si existe)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_partner_commission_sale_socio'
    ) THEN
        COMMENT ON CONSTRAINT unique_partner_commission_sale_socio ON partner_commissions 
        IS 'Garantiza que no puede haber dos comisiones para el mismo socio en la misma venta';
    END IF;
END $$;

