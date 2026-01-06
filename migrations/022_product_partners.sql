-- =====================================================
-- CAPITAL PLUS AI AGENT - PRODUCT PARTNERS
-- =====================================================
-- Migración para almacenar los socios del producto relacionados con ventas comisionables
-- Esto evita hacer consultas constantes a la API de Zoho
-- 
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/022_product_partners.sql
-- =====================================================

-- =====================================================
-- TABLA: commission_product_partners
-- Almacena los socios del producto y su participación para cada venta comisionable
-- =====================================================
CREATE TABLE IF NOT EXISTS commission_product_partners (
    id SERIAL PRIMARY KEY,
    commission_sale_id INTEGER NOT NULL REFERENCES commission_sales(id) ON DELETE CASCADE,
    zoho_product_id VARCHAR(255), -- ID del producto en Zoho (opcional, para referencia)
    socio_name VARCHAR(500) NOT NULL, -- Nombre del socio
    participacion DECIMAL(5, 2) DEFAULT 0 CHECK (participacion >= 0 AND participacion <= 100), -- Porcentaje de participación (0-100)
    synced_from_zoho_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Fecha de sincronización desde Zoho
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(commission_sale_id, socio_name) -- Un socio solo puede aparecer una vez por venta
);

COMMENT ON TABLE commission_product_partners IS 'Socios del producto relacionados con ventas comisionables';
COMMENT ON COLUMN commission_product_partners.commission_sale_id IS 'ID de la venta comisionable relacionada';
COMMENT ON COLUMN commission_product_partners.zoho_product_id IS 'ID del producto en Zoho CRM (opcional)';
COMMENT ON COLUMN commission_product_partners.socio_name IS 'Nombre del socio del producto';
COMMENT ON COLUMN commission_product_partners.participacion IS 'Porcentaje de participación del socio (0-100)';
COMMENT ON COLUMN commission_product_partners.synced_from_zoho_at IS 'Fecha y hora de la última sincronización desde Zoho';

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_product_partners_sale_id ON commission_product_partners(commission_sale_id);
CREATE INDEX IF NOT EXISTS idx_product_partners_product_id ON commission_product_partners(zoho_product_id);
CREATE INDEX IF NOT EXISTS idx_product_partners_synced_at ON commission_product_partners(synced_from_zoho_at DESC);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_product_partners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_product_partners_updated_at
    BEFORE UPDATE ON commission_product_partners
    FOR EACH ROW
    EXECUTE FUNCTION update_product_partners_updated_at();

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================

