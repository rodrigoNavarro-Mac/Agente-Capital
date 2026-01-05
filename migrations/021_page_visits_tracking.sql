-- =====================================================
-- CAPITAL PLUS AI AGENT - PAGE VISITS TRACKING
-- =====================================================
-- Migración para rastrear visitas a módulos/páginas del sistema
-- Permite a los administradores ver qué usuarios visitaron qué módulos
-- 
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/021_page_visits_tracking.sql
-- =====================================================

-- =====================================================
-- TABLA: page_visits
-- Registra cada visita a una página/módulo del dashboard
-- =====================================================
CREATE TABLE IF NOT EXISTS page_visits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id INTEGER REFERENCES user_sessions(id) ON DELETE SET NULL,
    page_path VARCHAR(255) NOT NULL,
    page_name VARCHAR(255),
    module_name VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER,
    metadata JSONB
);

COMMENT ON TABLE page_visits IS 'Registro de visitas a páginas/módulos del sistema';
COMMENT ON COLUMN page_visits.user_id IS 'ID del usuario que visitó la página';
COMMENT ON COLUMN page_visits.session_id IS 'ID de la sesión activa del usuario';
COMMENT ON COLUMN page_visits.page_path IS 'Ruta de la página visitada (ej: /dashboard/commissions)';
COMMENT ON COLUMN page_visits.page_name IS 'Nombre descriptivo de la página (ej: Comisiones)';
COMMENT ON COLUMN page_visits.module_name IS 'Nombre del módulo (ej: commissions, documents, zoho)';
COMMENT ON COLUMN page_visits.ip_address IS 'Dirección IP desde la cual se accedió';
COMMENT ON COLUMN page_visits.user_agent IS 'User agent del navegador';
COMMENT ON COLUMN page_visits.visited_at IS 'Fecha y hora de la visita';
COMMENT ON COLUMN page_visits.duration_seconds IS 'Duración de la visita en segundos (si se puede calcular)';
COMMENT ON COLUMN page_visits.metadata IS 'Información adicional en formato JSON';

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_page_visits_user_id ON page_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_session_id ON page_visits(session_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_page_path ON page_visits(page_path);
CREATE INDEX IF NOT EXISTS idx_page_visits_module_name ON page_visits(module_name);
CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON page_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_user_visited ON page_visits(user_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_module_visited ON page_visits(module_name, visited_at DESC);

-- =====================================================
-- VISTA: user_sessions_with_info
-- Vista que combina sesiones con información del usuario
-- =====================================================
CREATE OR REPLACE VIEW user_sessions_with_info AS
SELECT 
    us.id,
    us.user_id,
    u.name AS user_name,
    u.email AS user_email,
    r.name AS user_role,
    us.session_token,
    us.ip_address,
    us.user_agent,
    us.created_at AS session_started_at,
    us.last_used_at AS session_last_used,
    us.expires_at AS session_expires_at,
    CASE 
        WHEN us.expires_at > NOW() THEN 'active'
        ELSE 'expired'
    END AS session_status,
    (SELECT COUNT(*) FROM page_visits pv WHERE pv.session_id = us.id) AS pages_visited_count
FROM user_sessions us
LEFT JOIN users u ON us.user_id = u.id
LEFT JOIN roles r ON u.role_id = r.id;

COMMENT ON VIEW user_sessions_with_info IS 'Vista que combina sesiones con información del usuario y estadísticas';

-- =====================================================
-- VISTA: user_activity_summary
-- Resumen de actividad por usuario
-- =====================================================
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT 
    u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email,
    r.name AS user_role,
    COUNT(DISTINCT us.id) AS total_sessions,
    COUNT(DISTINCT pv.id) AS total_page_visits,
    COUNT(DISTINCT pv.module_name) AS modules_visited,
    MAX(us.created_at) AS last_session_start,
    MAX(pv.visited_at) AS last_page_visit,
    STRING_AGG(DISTINCT pv.module_name, ', ' ORDER BY pv.module_name) AS modules_list
FROM users u
LEFT JOIN roles r ON u.role_id = r.id
LEFT JOIN user_sessions us ON u.id = us.user_id
LEFT JOIN page_visits pv ON u.id = pv.user_id
GROUP BY u.id, u.name, u.email, r.name;

COMMENT ON VIEW user_activity_summary IS 'Resumen de actividad por usuario incluyendo sesiones y visitas';

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================





