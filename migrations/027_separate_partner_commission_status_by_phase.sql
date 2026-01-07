-- =====================================================
-- CAPITAL PLUS AI AGENT - ESTADOS SEPARADOS POR FASE EN PARTNER_COMMISSIONS
-- =====================================================
-- Migración para separar el estado de cobro en dos campos independientes:
-- - sale_phase_collection_status: estado para la fase de venta
-- - post_sale_phase_collection_status: estado para la fase postventa
--
-- Esto permite que cada fase tenga su propio estado de cobro independiente
--
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/027_separate_partner_commission_status_by_phase.sql
-- =====================================================

-- =====================================================
-- PASO 1: Agregar nuevos campos de estado por fase
-- =====================================================

-- Agregar campo para estado de fase venta
ALTER TABLE partner_commissions
ADD COLUMN IF NOT EXISTS sale_phase_collection_status VARCHAR(20) DEFAULT 'pending_invoice'
CHECK (sale_phase_collection_status IN ('pending_invoice', 'invoiced', 'collected'));

-- Agregar campo para estado de fase postventa
ALTER TABLE partner_commissions
ADD COLUMN IF NOT EXISTS post_sale_phase_collection_status VARCHAR(20) DEFAULT 'pending_invoice'
CHECK (post_sale_phase_collection_status IN ('pending_invoice', 'invoiced', 'collected'));

-- =====================================================
-- PASO 2: Migrar datos existentes
-- =====================================================

-- Copiar el estado actual a ambos campos nuevos
UPDATE partner_commissions
SET 
    sale_phase_collection_status = collection_status,
    post_sale_phase_collection_status = collection_status
WHERE sale_phase_collection_status IS NULL OR post_sale_phase_collection_status IS NULL;

-- =====================================================
-- PASO 3: Agregar índices para los nuevos campos
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_partner_commissions_sale_phase_status 
ON partner_commissions(sale_phase_collection_status);

CREATE INDEX IF NOT EXISTS idx_partner_commissions_post_sale_phase_status 
ON partner_commissions(post_sale_phase_collection_status);

-- =====================================================
-- PASO 4: Actualizar comentarios
-- =====================================================

COMMENT ON COLUMN partner_commissions.sale_phase_collection_status IS 'Estado de cobro para la fase de venta: pending_invoice, invoiced, collected';
COMMENT ON COLUMN partner_commissions.post_sale_phase_collection_status IS 'Estado de cobro para la fase postventa: pending_invoice, invoiced, collected';
COMMENT ON COLUMN partner_commissions.collection_status IS 'DEPRECATED: Usar sale_phase_collection_status y post_sale_phase_collection_status. Se mantiene por compatibilidad.';

-- =====================================================
-- PASO 5: Actualizar función calculate_partner_commissions
-- =====================================================

-- Primero eliminar la función existente y recrearla
DROP FUNCTION IF EXISTS calculate_partner_commissions(INTEGER, INTEGER);

CREATE FUNCTION calculate_partner_commissions(
    p_commission_sale_id INTEGER,
    p_calculated_by INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    sale_record RECORD;
    partner_record RECORD;
    total_commission DECIMAL(15, 2);
    partner_amount DECIMAL(15, 2);
    inserted_count INTEGER := 0;
BEGIN
    -- Obtener información de la venta
    SELECT 
        commission_sale_phase,
        commission_post_sale_phase,
        (commission_sale_phase + commission_post_sale_phase) as total_commission
    INTO sale_record
    FROM commission_sales
    WHERE id = p_commission_sale_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada: %', p_commission_sale_id;
    END IF;

    total_commission := COALESCE(sale_record.total_commission, 0);

    -- Si no hay comisión, retornar 0
    IF total_commission <= 0 THEN
        RETURN 0;
    END IF;

    -- Iterar sobre los socios del producto
    FOR partner_record IN
        SELECT socio_name, participacion
        FROM commission_product_partners
        WHERE commission_sale_id = p_commission_sale_id
    LOOP
        -- Calcular monto para este socio
        partner_amount := total_commission * (partner_record.participacion / 100.0);

        -- Insertar o actualizar la comisión del socio
        INSERT INTO partner_commissions (
            commission_sale_id, socio_name, participacion,
            total_commission_amount, sale_phase_amount, post_sale_phase_amount,
            sale_phase_collection_status, post_sale_phase_collection_status,
            collection_status, -- Mantener por compatibilidad
            calculated_by, calculated_at
        ) VALUES (
            p_commission_sale_id, partner_record.socio_name, partner_record.participacion,
            partner_amount, sale_record.commission_sale_phase, sale_record.commission_post_sale_phase,
            'pending_invoice', 'pending_invoice', -- Estados iniciales por fase
            'pending_invoice', -- Mantener por compatibilidad
            p_calculated_by, CURRENT_TIMESTAMP
        )
        ON CONFLICT (commission_sale_id, socio_name) DO UPDATE SET
            participacion = EXCLUDED.participacion,
            total_commission_amount = EXCLUDED.total_commission_amount,
            sale_phase_amount = EXCLUDED.sale_phase_amount,
            post_sale_phase_amount = EXCLUDED.post_sale_phase_amount,
            -- Solo actualizar estados si no han sido modificados manualmente
            -- (mantener los estados existentes si ya fueron cambiados)
            sale_phase_collection_status = COALESCE(
                partner_commissions.sale_phase_collection_status,
                EXCLUDED.sale_phase_collection_status
            ),
            post_sale_phase_collection_status = COALESCE(
                partner_commissions.post_sale_phase_collection_status,
                EXCLUDED.post_sale_phase_collection_status
            ),
            calculated_by = EXCLUDED.calculated_by,
            calculated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP;

        inserted_count := inserted_count + 1;
    END LOOP;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_partner_commissions(INTEGER, INTEGER) IS 'Calcula las comisiones a cobrar a cada socio basado en su participación (flujo de ingresos). Ahora maneja estados separados por fase.';

