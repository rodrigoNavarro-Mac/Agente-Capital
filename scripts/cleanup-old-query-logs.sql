-- Script para limpiar query_logs antiguos del usuario 1
-- Estos logs fueron creados antes de la implementación de seguridad
-- y pueden contener conversaciones que no pertenecen al usuario actual

-- 1. Ver cuántos logs tiene el usuario 1
SELECT 
    COUNT(*) as total_logs,
    MIN(created_at) as primer_log,
    MAX(created_at) as ultimo_log
FROM query_logs
WHERE user_id = 1;

-- 2. Ver los logs del usuario 1 agrupados por fecha
SELECT 
    DATE(created_at) as fecha,
    COUNT(*) as cantidad_logs,
    STRING_AGG(DISTINCT zone, ', ') as zonas,
    STRING_AGG(DISTINCT development, ', ') as desarrollos
FROM query_logs
WHERE user_id = 1
GROUP BY DATE(created_at)
ORDER BY fecha DESC;

-- 3. Ver los logs más recientes del usuario 1 (últimos 10)
SELECT 
    id,
    user_id,
    zone,
    development,
    LEFT(query, 50) as query_preview,
    created_at
FROM query_logs
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 10;

-- 4. ELIMINAR todos los logs del usuario 1 (CUIDADO: Esto borra TODO el historial del usuario 1)
-- Descomenta la siguiente línea solo si estás seguro de querer eliminar todos los logs
-- DELETE FROM query_logs WHERE user_id = 1;

-- 5. ELIMINAR logs del usuario 1 anteriores a una fecha específica
-- Por ejemplo, eliminar logs anteriores al 2024-12-01
-- Descomenta y ajusta la fecha según necesites
-- DELETE FROM query_logs WHERE user_id = 1 AND created_at < '2024-12-01 00:00:00';

-- 6. ELIMINAR logs del usuario 1 de una zona/desarrollo específico
-- Descomenta y ajusta según necesites
-- DELETE FROM query_logs WHERE user_id = 1 AND zone = 'quintana_roo' AND development = 'fuego';

