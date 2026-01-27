-- =====================================================
-- MIGRACIÓN: Tabla de Socios Ocultos en Comisiones
-- =====================================================
-- Descripción: Crea tabla para almacenar socios que no deben 
--              aparecer en los reportes de comisiones por defecto
-- Fecha: 2026-01-27
-- =====================================================

CREATE TABLE IF NOT EXISTS commission_hidden_partners (
    id SERIAL PRIMARY KEY,
    socio_name VARCHAR(500) NOT NULL UNIQUE, -- Nombre del socio a ocultar
    description TEXT, -- Razón por la que se oculta
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id) -- Usuario que ocultó al socio
);

COMMENT ON TABLE commission_hidden_partners IS 'Lista de socios ocultos en el dashboard de comisiones';
COMMENT ON COLUMN commission_hidden_partners.socio_name IS 'Nombre del socio (debe coincidir con el nombre en partner_commissions)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_hidden_partners_socio_name ON commission_hidden_partners(socio_name);
