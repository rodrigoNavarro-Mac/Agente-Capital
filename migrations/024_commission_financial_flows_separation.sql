-- =====================================================
-- CAPITAL PLUS AI AGENT - SEPARACIÓN DE FLUJOS FINANCIEROS
-- =====================================================
-- Migración para implementar la separación conceptual clara entre:
-- 1. Comisiones Internas (Egresos) - pagos a equipo
-- 2. Comisiones a Socios (Ingresos) - cobros a socios
--
-- Estados independientes para cada flujo financiero
-- Implementación del evento POST_SALE_TRIGGER de Zoho Projects
--
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/024_commission_financial_flows_separation.sql
-- =====================================================

-- =====================================================
-- PASO 1: Agregar campos de estado independientes a commission_sales
-- =====================================================

-- Estados para el flujo interno (egresos)
ALTER TABLE commission_sales
ADD COLUMN IF NOT EXISTS internal_sale_phase_status VARCHAR(20) DEFAULT 'visible'
CHECK (internal_sale_phase_status IN ('visible', 'pending', 'paid'));

ALTER TABLE commission_sales
ADD COLUMN IF NOT EXISTS internal_post_sale_phase_status VARCHAR(20) DEFAULT 'hidden'
CHECK (internal_post_sale_phase_status IN ('hidden', 'upcoming', 'payable', 'paid'));

-- Estados para el flujo de socios (ingresos)
ALTER TABLE commission_sales
ADD COLUMN IF NOT EXISTS partner_commission_status VARCHAR(20) DEFAULT 'pending_invoice'
CHECK (partner_commission_status IN ('pending_invoice', 'invoiced', 'collected'));

-- Metadata para controlar el flujo
ALTER TABLE commission_sales
ADD COLUMN IF NOT EXISTS post_sale_triggered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE commission_sales
ADD COLUMN IF NOT EXISTS post_sale_triggered_by VARCHAR(100); -- 'zoho_projects', 'manual', etc.

-- Comentarios para los nuevos campos
COMMENT ON COLUMN commission_sales.internal_sale_phase_status IS 'Estado del flujo interno de venta: visible (siempre visible), pending (pendiente pago), paid (pagada)';
COMMENT ON COLUMN commission_sales.internal_post_sale_phase_status IS 'Estado del flujo interno de postventa: hidden (oculta hasta trigger), upcoming (activada por Zoho), payable (disponible para pago), paid (pagada)';
COMMENT ON COLUMN commission_sales.partner_commission_status IS 'Estado del flujo de cobro a socios: pending_invoice (pendiente facturar), invoiced (facturada), collected (cobrado)';
COMMENT ON COLUMN commission_sales.post_sale_triggered_at IS 'Fecha cuando se activó la postventa (trigger de Zoho Projects)';
COMMENT ON COLUMN commission_sales.post_sale_triggered_by IS 'Quién activó la postventa: zoho_projects, manual, etc.';

-- Índices para los nuevos campos
CREATE INDEX IF NOT EXISTS idx_commission_sales_internal_sale_status ON commission_sales(internal_sale_phase_status);
CREATE INDEX IF NOT EXISTS idx_commission_sales_internal_post_sale_status ON commission_sales(internal_post_sale_phase_status);
CREATE INDEX IF NOT EXISTS idx_commission_sales_partner_status ON commission_sales(partner_commission_status);
CREATE INDEX IF NOT EXISTS idx_commission_sales_post_sale_triggered_at ON commission_sales(post_sale_triggered_at);

-- =====================================================
-- PASO 2: Crear tabla para comisiones a socios (ingresos)
-- =====================================================

CREATE TABLE IF NOT EXISTS partner_commissions (
    id SERIAL PRIMARY KEY,
    commission_sale_id INTEGER NOT NULL REFERENCES commission_sales(id) ON DELETE CASCADE,
    socio_name VARCHAR(500) NOT NULL,
    participacion DECIMAL(5, 2) NOT NULL CHECK (participacion >= 0 AND participacion <= 100),

    -- Cálculo de la comisión al socio (100% de venta + postventa)
    total_commission_amount DECIMAL(15, 2) NOT NULL CHECK (total_commission_amount >= 0),
    sale_phase_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (sale_phase_amount >= 0),
    post_sale_phase_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (post_sale_phase_amount >= 0),

    -- Estado de cobro (independiente del flujo interno)
    collection_status VARCHAR(20) NOT NULL DEFAULT 'pending_invoice'
    CHECK (collection_status IN ('pending_invoice', 'invoiced', 'collected')),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    calculated_by INTEGER REFERENCES users(id)
);

COMMENT ON TABLE partner_commissions IS 'Comisiones a cobrar a socios (flujo de ingresos)';
COMMENT ON COLUMN partner_commissions.commission_sale_id IS 'ID de la venta relacionada';
COMMENT ON COLUMN partner_commissions.socio_name IS 'Nombre del socio';
COMMENT ON COLUMN partner_commissions.participacion IS 'Porcentaje de participación del socio';
COMMENT ON COLUMN partner_commissions.total_commission_amount IS 'Monto total de comisión a cobrar al socio';
COMMENT ON COLUMN partner_commissions.collection_status IS 'Estado de cobro: pending_invoice, invoiced, collected';

-- Índices para partner_commissions
CREATE INDEX IF NOT EXISTS idx_partner_commissions_sale_id ON partner_commissions(commission_sale_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_socio_name ON partner_commissions(socio_name);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_collection_status ON partner_commissions(collection_status);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_partner_commissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_partner_commissions_updated_at
    BEFORE UPDATE ON partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION update_partner_commissions_updated_at();

-- =====================================================
-- PASO 3: Crear tabla para facturas a socios
-- =====================================================

CREATE TABLE IF NOT EXISTS partner_invoices (
    id SERIAL PRIMARY KEY,
    partner_commission_id INTEGER NOT NULL REFERENCES partner_commissions(id) ON DELETE CASCADE,

    -- Información de la factura
    invoice_number VARCHAR(100) UNIQUE,
    invoice_date DATE NOT NULL,
    due_date DATE,
    invoice_amount DECIMAL(15, 2) NOT NULL CHECK (invoice_amount >= 0),
    iva_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (iva_amount >= 0),
    total_amount DECIMAL(15, 2) NOT NULL CHECK (total_amount >= 0),

    -- Archivo PDF de la factura
    invoice_pdf_path VARCHAR(500),
    invoice_pdf_uploaded_at TIMESTAMP WITH TIME ZONE,

    -- Estado de la factura
    invoice_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (invoice_status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id),
    sent_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE partner_invoices IS 'Facturas emitidas a socios por comisiones';
COMMENT ON COLUMN partner_invoices.partner_commission_id IS 'ID de la comisión al socio relacionada';
COMMENT ON COLUMN partner_invoices.invoice_status IS 'Estado de la factura: draft, sent, paid, overdue, cancelled';

-- Índices para partner_invoices
CREATE INDEX IF NOT EXISTS idx_partner_invoices_commission_id ON partner_invoices(partner_commission_id);
CREATE INDEX IF NOT EXISTS idx_partner_invoices_status ON partner_invoices(invoice_status);
CREATE INDEX IF NOT EXISTS idx_partner_invoices_due_date ON partner_invoices(due_date);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_partner_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_partner_invoices_updated_at
    BEFORE UPDATE ON partner_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_partner_invoices_updated_at();

-- =====================================================
-- PASO 4: Crear tabla para eventos de Zoho Projects
-- =====================================================

CREATE TABLE IF NOT EXISTS zoho_projects_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'post_sale_trigger', etc.
    zoho_project_id VARCHAR(255),
    zoho_task_id VARCHAR(255),
    commission_sale_id INTEGER REFERENCES commission_sales(id),

    -- Información del evento
    event_data JSONB, -- Datos adicionales del evento
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Metadata
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed')),
    processing_error TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE zoho_projects_events IS 'Eventos emitidos por Zoho Projects (solo triggers, no cálculos)';
COMMENT ON COLUMN zoho_projects_events.event_type IS 'Tipo de evento: post_sale_trigger, etc.';
COMMENT ON COLUMN zoho_projects_events.processing_status IS 'Estado del procesamiento: pending, processed, failed';

-- Índices para zoho_projects_events
CREATE INDEX IF NOT EXISTS idx_zoho_projects_events_type ON zoho_projects_events(event_type);
CREATE INDEX IF NOT EXISTS idx_zoho_projects_events_sale_id ON zoho_projects_events(commission_sale_id);
CREATE INDEX IF NOT EXISTS idx_zoho_projects_events_status ON zoho_projects_events(processing_status);

-- =====================================================
-- PASO 5: Actualizar valores por defecto para ventas existentes
-- =====================================================

-- Para ventas existentes donde commission_calculated = true,
-- establecer estados por defecto apropiados
UPDATE commission_sales
SET
    internal_sale_phase_status = 'visible',
    internal_post_sale_phase_status = 'hidden',
    partner_commission_status = 'pending_invoice'
WHERE commission_calculated = true;

-- =====================================================
-- PASO 6: Función para procesar POST_SALE_TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION process_post_sale_trigger(
    p_commission_sale_id INTEGER,
    p_triggered_by VARCHAR(100) DEFAULT 'zoho_projects'
)
RETURNS BOOLEAN AS $$
DECLARE
    current_status VARCHAR(20);
BEGIN
    -- Verificar que la venta existe y está calculada
    IF NOT EXISTS (
        SELECT 1 FROM commission_sales
        WHERE id = p_commission_sale_id AND commission_calculated = true
    ) THEN
        RAISE EXCEPTION 'Venta no encontrada o no calculada';
    END IF;

    -- Obtener el estado actual de postventa
    SELECT internal_post_sale_phase_status INTO current_status
    FROM commission_sales
    WHERE id = p_commission_sale_id;

    -- Solo procesar si está en estado 'hidden'
    IF current_status = 'hidden' THEN
        UPDATE commission_sales
        SET
            internal_post_sale_phase_status = 'upcoming',
            post_sale_triggered_at = CURRENT_TIMESTAMP,
            post_sale_triggered_by = p_triggered_by,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_commission_sale_id;

        RETURN true;
    ELSE
        -- Ya estaba activada, no hacer nada
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_post_sale_trigger(INTEGER, VARCHAR) IS 'Procesa el evento POST_SALE_TRIGGER de Zoho Projects, cambiando el estado de postventa de hidden → upcoming';

-- =====================================================
-- PASO 7: Función para calcular comisiones a socios
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_partner_commissions(
    p_commission_sale_id INTEGER,
    p_calculated_by INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    sale_record RECORD;
    partner_record RECORD;
    total_commission DECIMAL(15, 2) := 0;
    partner_amount DECIMAL(15, 2) := 0;
    inserted_count INTEGER := 0;
BEGIN
    -- Obtener datos de la venta
    SELECT
        cs.id, cs.commission_sale_phase, cs.commission_post_sale_phase,
        cs.internal_sale_phase_status, cs.partner_commission_status
    INTO sale_record
    FROM commission_sales cs
    WHERE cs.id = p_commission_sale_id AND cs.commission_calculated = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada o no calculada';
    END IF;

    -- Calcular el total de comisión para socios (100% de venta + postventa)
    total_commission := COALESCE(sale_record.commission_sale_phase, 0) +
                       COALESCE(sale_record.commission_post_sale_phase, 0);

    -- Procesar cada socio
    FOR partner_record IN
        SELECT cpp.socio_name, cpp.participacion
        FROM commission_product_partners cpp
        WHERE cpp.commission_sale_id = p_commission_sale_id
    LOOP
        -- Calcular monto para este socio
        partner_amount := total_commission * (partner_record.participacion / 100.0);

        -- Insertar o actualizar la comisión del socio
        INSERT INTO partner_commissions (
            commission_sale_id, socio_name, participacion,
            total_commission_amount, sale_phase_amount, post_sale_phase_amount,
            calculated_by, calculated_at
        ) VALUES (
            p_commission_sale_id, partner_record.socio_name, partner_record.participacion,
            partner_amount, sale_record.commission_sale_phase, sale_record.commission_post_sale_phase,
            p_calculated_by, CURRENT_TIMESTAMP
        )
        ON CONFLICT (commission_sale_id, socio_name) DO UPDATE SET
            participacion = EXCLUDED.participacion,
            total_commission_amount = EXCLUDED.total_commission_amount,
            sale_phase_amount = EXCLUDED.sale_phase_amount,
            post_sale_phase_amount = EXCLUDED.post_sale_phase_amount,
            calculated_by = EXCLUDED.calculated_by,
            calculated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP;

        inserted_count := inserted_count + 1;
    END LOOP;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_partner_commissions(INTEGER, INTEGER) IS 'Calcula las comisiones a cobrar a cada socio basado en su participación (flujo de ingresos)';

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
