-- =====================================================
-- CAPITAL PLUS AI AGENT - CÁLCULO DE COMISIONES POR SOCIO DESDE CONFIGURACIÓN
-- =====================================================
-- Migración para actualizar calculate_partner_commissions para que:
-- 1. Calcule el monto de fase postventa usando la configuración guardada (calculated_phase_post_sale_percent)
-- 2. Calcule el monto de fase venta usando la configuración guardada (calculated_phase_sale_percent)
-- 3. Multiplique estos montos por la participación del socio
--
-- Esto asegura que los montos se "bloqueen" usando los porcentajes guardados en la DB
--
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/028_update_partner_commissions_calculation_from_config.sql
-- =====================================================

-- =====================================================
-- PASO 1: Actualizar función calculate_partner_commissions
-- =====================================================

-- Eliminar la función existente
DROP FUNCTION IF EXISTS calculate_partner_commissions(INTEGER, INTEGER);

CREATE FUNCTION calculate_partner_commissions(
    p_commission_sale_id INTEGER,
    p_calculated_by INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    sale_record RECORD;
    partner_record RECORD;
    valor_total DECIMAL(15, 2);
    phase_sale_percent DECIMAL(5, 2);
    phase_post_sale_percent DECIMAL(5, 2);
    sale_phase_total_amount DECIMAL(15, 2);
    post_sale_phase_total_amount DECIMAL(15, 2);
    total_commission DECIMAL(15, 2);
    partner_sale_phase_amount DECIMAL(15, 2);
    partner_post_sale_phase_amount DECIMAL(15, 2);
    partner_total_amount DECIMAL(15, 2);
    inserted_count INTEGER := 0;
BEGIN
    -- Obtener información de la venta incluyendo valor_total y porcentajes guardados
    SELECT 
        cs.valor_total,
        cs.calculated_phase_sale_percent,
        cs.calculated_phase_post_sale_percent,
        cs.commission_sale_phase, -- Mantener para compatibilidad/fallback
        cs.commission_post_sale_phase -- Mantener para compatibilidad/fallback
    INTO sale_record
    FROM commission_sales cs
    WHERE cs.id = p_commission_sale_id AND cs.commission_calculated = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada o no calculada: %', p_commission_sale_id;
    END IF;

    valor_total := COALESCE(sale_record.valor_total, 0);
    phase_sale_percent := COALESCE(sale_record.calculated_phase_sale_percent, 0);
    phase_post_sale_percent := COALESCE(sale_record.calculated_phase_post_sale_percent, 0);

    -- Calcular montos totales de cada fase usando la configuración guardada
    -- Si no hay porcentajes guardados, usar los montos ya calculados como fallback
    IF phase_sale_percent > 0 AND phase_post_sale_percent > 0 THEN
        -- Calcular desde la configuración: valor_total * porcentaje / 100
        sale_phase_total_amount := ROUND((valor_total * phase_sale_percent / 100.0)::numeric, 2);
        post_sale_phase_total_amount := ROUND((valor_total * phase_post_sale_percent / 100.0)::numeric, 2);
    ELSE
        -- Fallback: usar los montos ya calculados en commission_sales
        sale_phase_total_amount := COALESCE(sale_record.commission_sale_phase, 0);
        post_sale_phase_total_amount := COALESCE(sale_record.commission_post_sale_phase, 0);
    END IF;

    total_commission := sale_phase_total_amount + post_sale_phase_total_amount;

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
        -- Calcular montos para este socio multiplicando por su participación
        -- Fase venta: monto_total_fase_venta * (participacion / 100)
        partner_sale_phase_amount := ROUND((sale_phase_total_amount * partner_record.participacion / 100.0)::numeric, 2);
        
        -- Fase postventa: monto_total_fase_postventa * (participacion / 100)
        partner_post_sale_phase_amount := ROUND((post_sale_phase_total_amount * partner_record.participacion / 100.0)::numeric, 2);
        
        -- Total para el socio
        partner_total_amount := partner_sale_phase_amount + partner_post_sale_phase_amount;

        -- Insertar o actualizar la comisión del socio
        INSERT INTO partner_commissions (
            commission_sale_id, socio_name, participacion,
            total_commission_amount, sale_phase_amount, post_sale_phase_amount,
            sale_phase_collection_status, post_sale_phase_collection_status,
            collection_status, -- Mantener por compatibilidad
            calculated_by, calculated_at
        ) VALUES (
            p_commission_sale_id, partner_record.socio_name, partner_record.participacion,
            partner_total_amount, partner_sale_phase_amount, partner_post_sale_phase_amount,
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

COMMENT ON FUNCTION calculate_partner_commissions(INTEGER, INTEGER) IS 'Calcula las comisiones a cobrar a cada socio basado en su participación. Usa los porcentajes guardados (calculated_phase_sale_percent y calculated_phase_post_sale_percent) para calcular los montos de cada fase, luego multiplica por la participación del socio.';

