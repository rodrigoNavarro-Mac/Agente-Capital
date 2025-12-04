-- =====================================================
-- CAPITAL PLUS AI AGENT - INITIAL DATABASE SCHEMA
-- =====================================================
-- Migración inicial para crear todas las tablas necesarias.
-- 
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/001_initial_schema.sql
-- =====================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLA: roles
-- Roles de usuario del sistema
-- =====================================================
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE roles IS 'Roles de usuario del sistema';
COMMENT ON COLUMN roles.name IS 'Nombre único del rol (admin, manager, sales, support, viewer)';

-- Insertar roles por defecto (deben coincidir con src/lib/constants.ts)
INSERT INTO roles (name, description) VALUES
    ('ceo', 'CEO - Acceso total al sistema'),
    ('admin', 'Administrador - Gestión completa del sistema'),
    ('sales_manager', 'Gerente de Ventas - Gestión de ventas y desarrollos'),
    ('sales_agent', 'Agente de Ventas - Consultas y uploads limitados'),
    ('post_sales', 'Post-Venta - Soporte al cliente post-venta'),
    ('legal_manager', 'Gerente Legal - Gestión de documentos legales'),
    ('marketing_manager', 'Gerente de Marketing - Gestión de marketing y contenido')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TABLA: permissions
-- Permisos disponibles en el sistema
-- =====================================================
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE permissions IS 'Permisos disponibles en el sistema';

-- Insertar permisos por defecto
INSERT INTO permissions (name, description) VALUES
    ('upload_documents', 'Puede subir documentos al sistema'),
    ('delete_documents', 'Puede eliminar documentos'),
    ('query_agent', 'Puede realizar consultas al agente de IA'),
    ('manage_users', 'Puede crear, editar y eliminar usuarios'),
    ('manage_config', 'Puede modificar la configuración del agente'),
    ('view_logs', 'Puede ver logs de consultas'),
    ('manage_developments', 'Puede gestionar zonas y desarrollos')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TABLA: role_permissions
-- Relación muchos a muchos entre roles y permisos
-- =====================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE role_permissions IS 'Asignación de permisos a roles';

-- Asignar permisos a roles (deben coincidir con src/lib/constants.ts)
-- CEO: todos los permisos
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'ceo'
ON CONFLICT DO NOTHING;

-- Admin: todos los permisos
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Sales Manager: upload, query, view_logs, manage_developments
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'sales_manager' AND p.name IN ('upload_documents', 'query_agent', 'view_logs', 'manage_developments')
ON CONFLICT DO NOTHING;

-- Sales Agent: upload, query, view_logs
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'sales_agent' AND p.name IN ('upload_documents', 'query_agent', 'view_logs')
ON CONFLICT DO NOTHING;

-- Post Sales: query, view_logs
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'post_sales' AND p.name IN ('query_agent', 'view_logs')
ON CONFLICT DO NOTHING;

-- Legal Manager: upload, query, view_logs, manage_developments
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'legal_manager' AND p.name IN ('upload_documents', 'query_agent', 'view_logs', 'manage_developments')
ON CONFLICT DO NOTHING;

-- Marketing Manager: upload, query, view_logs, manage_developments
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'marketing_manager' AND p.name IN ('upload_documents', 'query_agent', 'view_logs', 'manage_developments')
ON CONFLICT DO NOTHING;

-- =====================================================
-- TABLA: users
-- Usuarios del sistema
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS 'Usuarios del sistema';
COMMENT ON COLUMN users.email IS 'Email único del usuario';
COMMENT ON COLUMN users.is_active IS 'Si el usuario está activo en el sistema';

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Usuario admin por defecto
INSERT INTO users (email, name, role_id, is_active)
SELECT 'admin@capitalplus.com', 'Administrador del Sistema', r.id, true
FROM roles r WHERE r.name = 'admin'
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- TABLA: user_developments
-- Desarrollos accesibles por cada usuario
-- =====================================================
CREATE TABLE IF NOT EXISTS user_developments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    can_upload BOOLEAN DEFAULT false,
    can_query BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, zone, development)
);

COMMENT ON TABLE user_developments IS 'Asignación de desarrollos accesibles por usuario';
COMMENT ON COLUMN user_developments.zone IS 'Zona geográfica (yucatan, puebla, quintana_roo, etc.)';
COMMENT ON COLUMN user_developments.development IS 'Nombre del desarrollo';
COMMENT ON COLUMN user_developments.can_upload IS 'Si puede subir documentos a este desarrollo';
COMMENT ON COLUMN user_developments.can_query IS 'Si puede consultar información de este desarrollo';

-- Índices para user_developments
CREATE INDEX IF NOT EXISTS idx_user_dev_user ON user_developments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dev_zone ON user_developments(zone);
CREATE INDEX IF NOT EXISTS idx_user_dev_development ON user_developments(development);

-- =====================================================
-- TABLA: documents_meta
-- Metadata de documentos subidos
-- =====================================================
CREATE TABLE IF NOT EXISTS documents_meta (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pinecone_namespace VARCHAR(255) NOT NULL,
    tags TEXT[],
    file_size_bytes BIGINT,
    chunks_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE documents_meta IS 'Metadata de documentos procesados y subidos a Pinecone';
COMMENT ON COLUMN documents_meta.type IS 'Tipo de documento (brochure, policy, price, inventory, etc.)';
COMMENT ON COLUMN documents_meta.pinecone_namespace IS 'Namespace en Pinecone donde se almacenaron los chunks';
COMMENT ON COLUMN documents_meta.tags IS 'Etiquetas adicionales para categorización';

-- Índices para documents_meta
CREATE INDEX IF NOT EXISTS idx_docs_zone ON documents_meta(zone);
CREATE INDEX IF NOT EXISTS idx_docs_development ON documents_meta(development);
CREATE INDEX IF NOT EXISTS idx_docs_type ON documents_meta(type);
CREATE INDEX IF NOT EXISTS idx_docs_uploaded_by ON documents_meta(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_docs_created ON documents_meta(created_at);

-- =====================================================
-- TABLA: query_logs
-- Logs de consultas realizadas al agente
-- =====================================================
CREATE TABLE IF NOT EXISTS query_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    response TEXT,
    sources_used TEXT[],
    response_time_ms INTEGER,
    tokens_used INTEGER,
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE query_logs IS 'Historial de consultas realizadas al agente';
COMMENT ON COLUMN query_logs.response_time_ms IS 'Tiempo de respuesta en milisegundos';
COMMENT ON COLUMN query_logs.tokens_used IS 'Tokens utilizados por el LLM';
COMMENT ON COLUMN query_logs.feedback_rating IS 'Calificación del usuario (1-5)';

-- Índices para query_logs
CREATE INDEX IF NOT EXISTS idx_logs_user ON query_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_zone ON query_logs(zone);
CREATE INDEX IF NOT EXISTS idx_logs_development ON query_logs(development);
CREATE INDEX IF NOT EXISTS idx_logs_created ON query_logs(created_at);

-- =====================================================
-- TABLA: agent_config
-- Configuración del agente de IA
-- =====================================================
CREATE TABLE IF NOT EXISTS agent_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE agent_config IS 'Configuración del agente de IA';
COMMENT ON COLUMN agent_config.key IS 'Clave de configuración única';
COMMENT ON COLUMN agent_config.value IS 'Valor de la configuración (puede ser JSON para valores complejos)';

-- Insertar configuración por defecto
INSERT INTO agent_config (key, value, description) VALUES
    ('temperature', '0.2', 'Temperatura del modelo LLM (0-2, menor = más determinístico)'),
    ('top_k', '5', 'Número de resultados a recuperar de Pinecone'),
    ('chunk_size', '500', 'Tamaño máximo de chunks en tokens'),
    ('chunk_overlap', '50', 'Solapamiento entre chunks en tokens'),
    ('max_tokens', '2048', 'Tokens máximos de respuesta del LLM'),
    ('enable_source_citations', 'true', 'Incluir citas de fuentes en las respuestas'),
    ('default_zone', 'yucatan', 'Zona por defecto para consultas')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Aplicar triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_meta_updated_at ON documents_meta;
CREATE TRIGGER update_documents_meta_updated_at
    BEFORE UPDATE ON documents_meta
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_config_updated_at ON agent_config;
CREATE TRIGGER update_agent_config_updated_at
    BEFORE UPDATE ON agent_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista de usuarios con sus roles
CREATE OR REPLACE VIEW v_users_with_roles AS
SELECT 
    u.id,
    u.email,
    u.name,
    r.name as role_name,
    u.is_active,
    u.created_at
FROM users u
LEFT JOIN roles r ON u.role_id = r.id;

-- Vista de documentos por zona
CREATE OR REPLACE VIEW v_documents_by_zone AS
SELECT 
    zone,
    development,
    type,
    COUNT(*) as document_count,
    SUM(chunks_count) as total_chunks,
    MAX(created_at) as last_upload
FROM documents_meta
GROUP BY zone, development, type
ORDER BY zone, development, type;

-- Vista de estadísticas de consultas
CREATE OR REPLACE VIEW v_query_stats AS
SELECT 
    zone,
    development,
    COUNT(*) as total_queries,
    AVG(response_time_ms)::INTEGER as avg_response_time_ms,
    AVG(tokens_used)::INTEGER as avg_tokens_used,
    AVG(feedback_rating)::NUMERIC(3,2) as avg_rating
FROM query_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY zone, development
ORDER BY total_queries DESC;

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================

-- Verificar tablas creadas
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

