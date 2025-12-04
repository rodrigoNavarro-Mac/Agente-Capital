-- =====================================================
-- CAPITAL PLUS AI AGENT - UPDATE ROLES MIGRATION
-- =====================================================
-- Migración para actualizar los roles a los definidos en constants.ts
-- 
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/002_update_roles.sql
-- =====================================================

-- Eliminar roles antiguos que no están en constants.ts
-- Primero, actualizar usuarios con roles antiguos a roles nuevos equivalentes
UPDATE users 
SET role_id = (SELECT id FROM roles WHERE name = 'sales_agent')
WHERE role_id = (SELECT id FROM roles WHERE name = 'sales');

UPDATE users 
SET role_id = (SELECT id FROM roles WHERE name = 'post_sales')
WHERE role_id = (SELECT id FROM roles WHERE name = 'support');

UPDATE users 
SET role_id = (SELECT id FROM roles WHERE name = 'sales_manager')
WHERE role_id = (SELECT id FROM roles WHERE name = 'manager');

-- Eliminar permisos de roles antiguos
DELETE FROM role_permissions 
WHERE role_id IN (
  SELECT id FROM roles 
  WHERE name IN ('manager', 'sales', 'support', 'viewer')
);

-- Eliminar roles antiguos
DELETE FROM roles 
WHERE name IN ('manager', 'sales', 'support', 'viewer');

-- Insertar nuevos roles si no existen
INSERT INTO roles (name, description) VALUES
    ('ceo', 'CEO - Acceso total al sistema'),
    ('sales_manager', 'Gerente de Ventas - Gestión de ventas y desarrollos'),
    ('sales_agent', 'Agente de Ventas - Consultas y uploads limitados'),
    ('post_sales', 'Post-Venta - Soporte al cliente post-venta'),
    ('legal_manager', 'Gerente Legal - Gestión de documentos legales'),
    ('marketing_manager', 'Gerente de Marketing - Gestión de marketing y contenido')
ON CONFLICT (name) DO NOTHING;

-- Asignar permisos a los nuevos roles
-- CEO: todos los permisos
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'ceo'
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

-- Verificar que admin tenga todos los permisos
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

