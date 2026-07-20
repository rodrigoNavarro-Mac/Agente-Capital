-- =====================================================
-- MIGRACIÓN: Nuevos roles de comisión
-- =====================================================
-- Descripción: Agrega 4 roles nuevos al módulo de comisiones:
--   - Setter (por desarrollo, fase venta)
--   - Coordinador ROC/MKT (global, fase venta)
--   - Gerente de Operaciones (global, fase venta)
--   - Dirección General (global, fase venta por defecto;
--     caso especial: se puede mover a postventa por venta
--     individual desde la distribución interna)
-- Fecha: 2026-07-20
-- =====================================================

-- Setter: rol directo por desarrollo, fase venta (mismo patrón que sale_manager_percent)
ALTER TABLE commission_configs
  ADD COLUMN IF NOT EXISTS setter_percent DECIMAL(5, 2) NOT NULL DEFAULT 0
  CHECK (setter_percent >= 0 AND setter_percent <= 100);

COMMENT ON COLUMN commission_configs.setter_percent IS 'Porcentaje para el Setter del desarrollo (fase venta)';

-- Roles globales nuevos (mismo patrón que operations_coordinator_percent/marketing_percent)
-- Nota: se usa INSERT ... WHERE NOT EXISTS en vez de ON CONFLICT porque el constraint
-- real es UNIQUE(config_key, phase), no UNIQUE(config_key) como asumía la migración 011.
-- La columna "phase" (NOT NULL, CHECK IN ('sale','post_sale')) tampoco está en las
-- migraciones de este repo pero existe en la base de datos real; los 3 roles nuevos
-- son de fase venta, igual que operations_coordinator_percent/marketing_percent.
INSERT INTO commission_global_configs (config_key, config_value, description, phase)
SELECT 'roc_mkt_coordinator_percent', 0, 'Porcentaje global para Coordinador ROC/MKT', 'sale'
WHERE NOT EXISTS (SELECT 1 FROM commission_global_configs WHERE config_key = 'roc_mkt_coordinator_percent');

INSERT INTO commission_global_configs (config_key, config_value, description, phase)
SELECT 'operations_manager_percent', 0, 'Porcentaje global para Gerente de Operaciones', 'sale'
WHERE NOT EXISTS (SELECT 1 FROM commission_global_configs WHERE config_key = 'operations_manager_percent');

INSERT INTO commission_global_configs (config_key, config_value, description, phase)
SELECT 'general_management_percent', 0, 'Porcentaje global para Dirección General (fase venta por defecto, movible a postventa por venta individual)', 'sale'
WHERE NOT EXISTS (SELECT 1 FROM commission_global_configs WHERE config_key = 'general_management_percent');
