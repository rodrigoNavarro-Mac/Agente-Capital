-- =====================================================
-- MIGRACIÓN 047: Historial de transiciones de etapa (Zoho CRM)
-- =====================================================
-- Captura cada cambio de status/stage de leads y deals para
-- medir velocidad del pipeline y tiempo por etapa.

CREATE TABLE IF NOT EXISTS zoho_stage_history (
  id                    SERIAL PRIMARY KEY,
  record_type           VARCHAR(10) NOT NULL CHECK (record_type IN ('lead', 'deal')),
  record_id             VARCHAR(255) NOT NULL,
  desarrollo            VARCHAR(255),
  owner_name            VARCHAR(255),
  from_stage            VARCHAR(100),                         -- NULL = primera inserción
  to_stage              VARCHAR(100) NOT NULL,
  changed_at            TIMESTAMP WITH TIME ZONE NOT NULL,   -- = modified_time de Zoho
  tiempo_en_fase_previo INTEGER,                             -- días en from_stage (campo Zoho)
  synced_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_zoho_stage_history_record
  ON zoho_stage_history (record_id, record_type);

CREATE INDEX IF NOT EXISTS idx_zoho_stage_history_changed_at
  ON zoho_stage_history (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_zoho_stage_history_desarrollo
  ON zoho_stage_history (desarrollo, record_type, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_zoho_stage_history_owner
  ON zoho_stage_history (owner_name, record_type, changed_at DESC);
