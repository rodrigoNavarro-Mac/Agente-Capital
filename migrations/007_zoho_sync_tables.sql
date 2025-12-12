-- =====================================================
-- MIGRACIÓN: Tablas de Sincronización de Zoho CRM
-- =====================================================
-- Descripción: Crea tablas para almacenar leads y deals
--              sincronizados desde Zoho CRM
-- Fecha: 2025-01-12
-- =====================================================

-- =====================================================
-- TABLA: zoho_leads
-- Almacena leads sincronizados de Zoho CRM
-- =====================================================
CREATE TABLE IF NOT EXISTS zoho_leads (
    id VARCHAR(255) PRIMARY KEY, -- ID de Zoho
    zoho_id VARCHAR(255) UNIQUE NOT NULL, -- ID original de Zoho
    data JSONB NOT NULL, -- Todos los campos de Zoho en formato JSON
    full_name VARCHAR(500),
    email VARCHAR(255),
    phone VARCHAR(100),
    company VARCHAR(500),
    lead_status VARCHAR(100),
    lead_source VARCHAR(100),
    industry VARCHAR(100),
    desarrollo VARCHAR(255), -- Campo personalizado
    motivo_descarte TEXT, -- Campo personalizado
    tiempo_en_fase INTEGER, -- Campo personalizado (días)
    owner_id VARCHAR(255),
    owner_name VARCHAR(255),
    created_time TIMESTAMP WITH TIME ZONE,
    modified_time TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE zoho_leads IS 'Leads sincronizados de Zoho CRM';
COMMENT ON COLUMN zoho_leads.zoho_id IS 'ID original de Zoho CRM';
COMMENT ON COLUMN zoho_leads.data IS 'Todos los campos de Zoho en formato JSONB para flexibilidad';
COMMENT ON COLUMN zoho_leads.synced_at IS 'Primera vez que se sincronizó este registro';
COMMENT ON COLUMN zoho_leads.last_sync_at IS 'Última vez que se actualizó desde Zoho';

-- Índices para zoho_leads
CREATE INDEX IF NOT EXISTS idx_zoho_leads_status ON zoho_leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_zoho_leads_desarrollo ON zoho_leads(desarrollo);
CREATE INDEX IF NOT EXISTS idx_zoho_leads_email ON zoho_leads(email);
CREATE INDEX IF NOT EXISTS idx_zoho_leads_created ON zoho_leads(created_time);
CREATE INDEX IF NOT EXISTS idx_zoho_leads_modified ON zoho_leads(modified_time);
CREATE INDEX IF NOT EXISTS idx_zoho_leads_synced ON zoho_leads(last_sync_at);
CREATE INDEX IF NOT EXISTS idx_zoho_leads_data_gin ON zoho_leads USING GIN(data); -- Índice GIN para búsquedas en JSONB

-- =====================================================
-- TABLA: zoho_deals
-- Almacena deals sincronizados de Zoho CRM
-- =====================================================
CREATE TABLE IF NOT EXISTS zoho_deals (
    id VARCHAR(255) PRIMARY KEY, -- ID de Zoho
    zoho_id VARCHAR(255) UNIQUE NOT NULL, -- ID original de Zoho
    data JSONB NOT NULL, -- Todos los campos de Zoho en formato JSON
    deal_name VARCHAR(500),
    amount DECIMAL(15, 2),
    stage VARCHAR(100),
    closing_date DATE,
    probability INTEGER,
    lead_source VARCHAR(100),
    type VARCHAR(100),
    desarrollo VARCHAR(255), -- Campo personalizado
    motivo_descarte TEXT, -- Campo personalizado
    tiempo_en_fase INTEGER, -- Campo personalizado (días)
    owner_id VARCHAR(255),
    owner_name VARCHAR(255),
    account_id VARCHAR(255),
    account_name VARCHAR(500),
    created_time TIMESTAMP WITH TIME ZONE,
    modified_time TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE zoho_deals IS 'Deals sincronizados de Zoho CRM';
COMMENT ON COLUMN zoho_deals.zoho_id IS 'ID original de Zoho CRM';
COMMENT ON COLUMN zoho_deals.data IS 'Todos los campos de Zoho en formato JSONB para flexibilidad';
COMMENT ON COLUMN zoho_deals.synced_at IS 'Primera vez que se sincronizó este registro';
COMMENT ON COLUMN zoho_deals.last_sync_at IS 'Última vez que se actualizó desde Zoho';

-- Índices para zoho_deals
CREATE INDEX IF NOT EXISTS idx_zoho_deals_stage ON zoho_deals(stage);
CREATE INDEX IF NOT EXISTS idx_zoho_deals_desarrollo ON zoho_deals(desarrollo);
CREATE INDEX IF NOT EXISTS idx_zoho_deals_amount ON zoho_deals(amount);
CREATE INDEX IF NOT EXISTS idx_zoho_deals_closing_date ON zoho_deals(closing_date);
CREATE INDEX IF NOT EXISTS idx_zoho_deals_created ON zoho_deals(created_time);
CREATE INDEX IF NOT EXISTS idx_zoho_deals_modified ON zoho_deals(modified_time);
CREATE INDEX IF NOT EXISTS idx_zoho_deals_synced ON zoho_deals(last_sync_at);
CREATE INDEX IF NOT EXISTS idx_zoho_deals_data_gin ON zoho_deals USING GIN(data); -- Índice GIN para búsquedas en JSONB

-- =====================================================
-- TABLA: zoho_sync_log
-- Registra las sincronizaciones realizadas
-- =====================================================
CREATE TABLE IF NOT EXISTS zoho_sync_log (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL, -- 'leads', 'deals', 'full'
    status VARCHAR(50) NOT NULL, -- 'success', 'error', 'partial'
    records_synced INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER
);

COMMENT ON TABLE zoho_sync_log IS 'Log de sincronizaciones con Zoho CRM';
COMMENT ON COLUMN zoho_sync_log.sync_type IS 'Tipo de sincronización: leads, deals, o full (ambos)';

-- Índices para zoho_sync_log
CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_type ON zoho_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_status ON zoho_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_started ON zoho_sync_log(started_at);

-- =====================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_zoho_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_zoho_deals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_zoho_leads_updated_at ON zoho_leads;
CREATE TRIGGER trigger_update_zoho_leads_updated_at
    BEFORE UPDATE ON zoho_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_zoho_leads_updated_at();

DROP TRIGGER IF EXISTS trigger_update_zoho_deals_updated_at ON zoho_deals;
CREATE TRIGGER trigger_update_zoho_deals_updated_at
    BEFORE UPDATE ON zoho_deals
    FOR EACH ROW
    EXECUTE FUNCTION update_zoho_deals_updated_at();

