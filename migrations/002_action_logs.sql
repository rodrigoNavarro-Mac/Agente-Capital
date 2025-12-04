-- =====================================================
-- MIGRACIÓN: ACTION LOGS
-- =====================================================
-- Tabla para registrar todas las acciones administrativas
-- del sistema (uploads, deletes, config changes, etc.)

-- =====================================================
-- TABLA: action_logs
-- Logs de todas las acciones del sistema
-- =====================================================
CREATE TABLE IF NOT EXISTS action_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INTEGER,
    zone VARCHAR(100),
    development VARCHAR(255),
    description TEXT NOT NULL,
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE action_logs IS 'Logs de todas las acciones administrativas del sistema';
COMMENT ON COLUMN action_logs.action_type IS 'Tipo de acción: upload, delete, update, create, query';
COMMENT ON COLUMN action_logs.resource_type IS 'Tipo de recurso: document, config, user, query';
COMMENT ON COLUMN action_logs.resource_id IS 'ID del recurso afectado (opcional)';
COMMENT ON COLUMN action_logs.metadata IS 'Información adicional en formato JSON';

-- Índices para action_logs
CREATE INDEX IF NOT EXISTS idx_action_logs_user ON action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_type ON action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_action_logs_resource ON action_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_action_logs_zone ON action_logs(zone);
CREATE INDEX IF NOT EXISTS idx_action_logs_created ON action_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_action_logs_user_type ON action_logs(user_id, action_type);

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================

