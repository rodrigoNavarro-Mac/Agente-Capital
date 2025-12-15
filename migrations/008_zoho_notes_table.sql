-- =====================================================
-- MIGRACIÓN: Tabla de Notas de Zoho CRM
-- =====================================================
-- Descripción: Crea tabla para almacenar notas de leads y deals
--              sincronizadas desde Zoho CRM
-- Fecha: 2025-01-12
-- =====================================================

-- =====================================================
-- TABLA: zoho_notes
-- Almacena notas sincronizadas de Zoho CRM
-- =====================================================
CREATE TABLE IF NOT EXISTS zoho_notes (
    id VARCHAR(255) PRIMARY KEY, -- ID de Zoho
    zoho_id VARCHAR(255) UNIQUE NOT NULL, -- ID original de Zoho
    parent_type VARCHAR(50) NOT NULL, -- 'Leads' o 'Deals'
    parent_id VARCHAR(255) NOT NULL, -- ID del lead o deal
    data JSONB NOT NULL, -- Todos los campos de Zoho en formato JSON
    note_title VARCHAR(500),
    note_content TEXT,
    owner_id VARCHAR(255),
    owner_name VARCHAR(255),
    created_time TIMESTAMP WITH TIME ZONE,
    modified_time TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE zoho_notes IS 'Notas sincronizadas de Zoho CRM';
COMMENT ON COLUMN zoho_notes.zoho_id IS 'ID original de Zoho CRM';
COMMENT ON COLUMN zoho_notes.parent_type IS 'Tipo de registro padre: Leads o Deals';
COMMENT ON COLUMN zoho_notes.parent_id IS 'ID del registro padre (lead o deal)';
COMMENT ON COLUMN zoho_notes.data IS 'Todos los campos de Zoho en formato JSONB para flexibilidad';
COMMENT ON COLUMN zoho_notes.synced_at IS 'Primera vez que se sincronizó esta nota';
COMMENT ON COLUMN zoho_notes.last_sync_at IS 'Última vez que se actualizó desde Zoho';

-- Índices para zoho_notes
CREATE INDEX IF NOT EXISTS idx_zoho_notes_parent ON zoho_notes(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_zoho_notes_created ON zoho_notes(created_time);
CREATE INDEX IF NOT EXISTS idx_zoho_notes_modified ON zoho_notes(modified_time);
CREATE INDEX IF NOT EXISTS idx_zoho_notes_synced ON zoho_notes(last_sync_at);
CREATE INDEX IF NOT EXISTS idx_zoho_notes_data_gin ON zoho_notes USING GIN(data); -- Índice GIN para búsquedas en JSONB

-- =====================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_zoho_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_zoho_notes_updated_at ON zoho_notes;
CREATE TRIGGER trigger_update_zoho_notes_updated_at
    BEFORE UPDATE ON zoho_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_zoho_notes_updated_at();

