-- =====================================================
-- MIGRACIÓN 048: Actividades de Zoho CRM (Calls / Tasks)
-- =====================================================
-- Almacena llamadas y tareas para análisis de comportamiento
-- comercial, heatmaps de actividad y scorecard de asesores.

CREATE TABLE IF NOT EXISTS zoho_activities (
  id                     VARCHAR(255) PRIMARY KEY,
  zoho_id                VARCHAR(255) UNIQUE NOT NULL,
  activity_type          VARCHAR(20) NOT NULL CHECK (activity_type IN ('Call', 'Task')),
  subject                TEXT,
  call_type              VARCHAR(50),                         -- 'Outbound' | 'Inbound'
  call_duration          VARCHAR(20),                         -- "HH:MM" formato Zoho
  call_duration_seconds  INTEGER,                             -- calculado al insertar
  call_start_time        TIMESTAMP WITH TIME ZONE,
  task_status            VARCHAR(50),
  due_date               DATE,
  owner_id               VARCHAR(255),
  owner_name             VARCHAR(255),
  lead_id                VARCHAR(255),
  deal_id                VARCHAR(255),
  desarrollo             VARCHAR(255),                        -- enriquecido desde BD local
  created_time           TIMESTAMP WITH TIME ZONE,
  modified_time          TIMESTAMP WITH TIME ZONE,
  data                   JSONB,
  synced_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_sync_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_zoho_activities_type
  ON zoho_activities (activity_type);

CREATE INDEX IF NOT EXISTS idx_zoho_activities_owner_type
  ON zoho_activities (owner_name, activity_type);

CREATE INDEX IF NOT EXISTS idx_zoho_activities_call_start
  ON zoho_activities (call_start_time DESC);

CREATE INDEX IF NOT EXISTS idx_zoho_activities_lead_id
  ON zoho_activities (lead_id);

CREATE INDEX IF NOT EXISTS idx_zoho_activities_deal_id
  ON zoho_activities (deal_id);

CREATE INDEX IF NOT EXISTS idx_zoho_activities_desarrollo
  ON zoho_activities (desarrollo, activity_type, call_start_time DESC);

-- Índice parcial para heatmap de llamadas (consulta más frecuente)
CREATE INDEX IF NOT EXISTS idx_zoho_activities_heatmap
  ON zoho_activities (call_start_time)
  WHERE activity_type = 'Call';
