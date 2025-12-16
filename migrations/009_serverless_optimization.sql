-- =====================================================
-- MIGRACIÓN: Optimización para Serverless
-- =====================================================
-- 
-- Esta migración agrega índices necesarios para:
-- 1. Keyset pagination (cursor-based) en lugar de OFFSET
-- 2. Optimización de queries frecuentes
-- 3. Mejora de performance en filtros comunes
-- 
-- FECHA: 2024
-- DESCRIPCIÓN: Índices para optimizar PostgreSQL en entornos serverless
-- =====================================================

-- =====================================================
-- ÍNDICES PARA KEYSET PAGINATION
-- =====================================================

-- Índice para query_logs con keyset pagination
-- Permite búsqueda eficiente por created_at DESC
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at_desc 
ON query_logs(created_at DESC);

-- Índice compuesto para query_logs filtrado por usuario
-- Permite paginación eficiente por usuario
CREATE INDEX IF NOT EXISTS idx_query_logs_user_created_desc 
ON query_logs(user_id, created_at DESC);

-- Índice compuesto para query_logs filtrado por zona y desarrollo
-- Permite paginación eficiente con filtros comunes
CREATE INDEX IF NOT EXISTS idx_query_logs_zone_dev_created 
ON query_logs(zone, development, created_at DESC);

-- =====================================================
-- ÍNDICES PARA ZOHO LEADS
-- =====================================================

-- Índice para zoho_leads con keyset pagination
-- Permite búsqueda eficiente por modified_time DESC
CREATE INDEX IF NOT EXISTS idx_zoho_leads_modified_desc 
ON zoho_leads(modified_time DESC);

-- Índice compuesto para zoho_leads filtrado por desarrollo
-- Permite paginación eficiente con filtro de desarrollo
CREATE INDEX IF NOT EXISTS idx_zoho_leads_dev_modified 
ON zoho_leads(desarrollo, modified_time DESC) 
WHERE desarrollo IS NOT NULL;

-- Índice para zoho_leads filtrado por created_time
-- Para búsquedas por rango de fechas
CREATE INDEX IF NOT EXISTS idx_zoho_leads_created_time 
ON zoho_leads(created_time DESC) 
WHERE created_time IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA ZOHO DEALS
-- =====================================================

-- Índice para zoho_deals con keyset pagination
-- Permite búsqueda eficiente por modified_time DESC
CREATE INDEX IF NOT EXISTS idx_zoho_deals_modified_desc 
ON zoho_deals(modified_time DESC);

-- Índice compuesto para zoho_deals filtrado por desarrollo
-- Permite paginación eficiente con filtro de desarrollo
CREATE INDEX IF NOT EXISTS idx_zoho_deals_dev_modified 
ON zoho_deals(desarrollo, modified_time DESC) 
WHERE desarrollo IS NOT NULL;

-- Índice para zoho_deals filtrado por created_time
-- Para búsquedas por rango de fechas
CREATE INDEX IF NOT EXISTS idx_zoho_deals_created_time 
ON zoho_deals(created_time DESC) 
WHERE created_time IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA ACTION LOGS
-- =====================================================

-- Índice para action_logs con keyset pagination
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at_desc 
ON action_logs(created_at DESC);

-- Índice compuesto para action_logs filtrado por usuario
CREATE INDEX IF NOT EXISTS idx_action_logs_user_created 
ON action_logs(user_id, created_at DESC);

-- Índice compuesto para action_logs filtrado por tipo de acción
CREATE INDEX IF NOT EXISTS idx_action_logs_action_created 
ON action_logs(action_type, created_at DESC);

-- =====================================================
-- ÍNDICES ADICIONALES PARA OPTIMIZACIÓN
-- =====================================================

-- Índice para búsquedas frecuentes en query_logs por zona
CREATE INDEX IF NOT EXISTS idx_query_logs_zone 
ON query_logs(zone) 
WHERE zone IS NOT NULL;

-- Índice para búsquedas frecuentes en query_logs por desarrollo
CREATE INDEX IF NOT EXISTS idx_query_logs_development 
ON query_logs(development) 
WHERE development IS NOT NULL;

-- Índice para zoho_leads por email (búsquedas frecuentes)
CREATE INDEX IF NOT EXISTS idx_zoho_leads_email 
ON zoho_leads(email) 
WHERE email IS NOT NULL;

-- Índice para zoho_leads por lead_status (filtros comunes)
CREATE INDEX IF NOT EXISTS idx_zoho_leads_status 
ON zoho_leads(lead_status) 
WHERE lead_status IS NOT NULL;

-- Índice para zoho_deals por stage (filtros comunes)
CREATE INDEX IF NOT EXISTS idx_zoho_deals_stage 
ON zoho_deals(stage) 
WHERE stage IS NOT NULL;

-- =====================================================
-- ANÁLISIS DE ÍNDICES
-- =====================================================

-- Ejecutar ANALYZE para actualizar estadísticas de índices
ANALYZE query_logs;
ANALYZE zoho_leads;
ANALYZE zoho_deals;
ANALYZE action_logs;

-- =====================================================
-- NOTAS
-- =====================================================
-- 
-- Estos índices mejoran significativamente el performance de:
-- 1. Keyset pagination (cursor-based) - O(log n) vs O(n) de OFFSET
-- 2. Filtros comunes por zona, desarrollo, usuario
-- 3. Búsquedas por rango de fechas
-- 
-- Los índices parciales (WHERE ... IS NOT NULL) reducen el tamaño
-- del índice y mejoran el performance cuando hay muchos valores NULL.
-- 
-- IMPORTANTE: Después de crear estos índices, las queries con OFFSET
-- seguirán funcionando, pero serán más lentas. Se recomienda migrar
-- a keyset pagination usando las funciones en postgres-serverless.ts

