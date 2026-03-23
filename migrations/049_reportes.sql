-- =====================================================
-- MIGRACIÓN 049: Tabla de Reportes de Ventas
-- =====================================================
CREATE TABLE IF NOT EXISTS reportes (
    id SERIAL PRIMARY KEY,
    desarrollo VARCHAR(100) NOT NULL,
    periodo VARCHAR(7) NOT NULL,
    canva_design_id VARCHAR(255),
    canva_export_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reportes_desarrollo_periodo_unique UNIQUE(desarrollo, periodo)
);

CREATE INDEX IF NOT EXISTS idx_reportes_desarrollo_periodo ON reportes(desarrollo, periodo);

CREATE OR REPLACE FUNCTION update_reportes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reportes_updated_at ON reportes;
CREATE TRIGGER trigger_update_reportes_updated_at
    BEFORE UPDATE ON reportes
    FOR EACH ROW
    EXECUTE FUNCTION update_reportes_updated_at();
