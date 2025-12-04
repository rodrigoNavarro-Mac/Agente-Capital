-- Script para verificar y corregir query_logs con user_id incorrecto
-- Este script muestra todos los query_logs y permite identificar problemas

-- 1. Ver todos los query_logs con información del usuario
SELECT 
    ql.id,
    ql.user_id,
    u.email as user_email,
    u.name as user_name,
    u.role as user_role,
    ql.zone,
    ql.development,
    LEFT(ql.query, 50) as query_preview,
    ql.created_at
FROM query_logs ql
LEFT JOIN users u ON ql.user_id = u.id
ORDER BY ql.created_at DESC
LIMIT 50;

-- 2. Contar logs por usuario
SELECT 
    ql.user_id,
    u.email as user_email,
    u.name as user_name,
    COUNT(*) as total_logs
FROM query_logs ql
LEFT JOIN users u ON ql.user_id = u.id
GROUP BY ql.user_id, u.email, u.name
ORDER BY total_logs DESC;

-- 3. Ver logs con user_id NULL o inválido
SELECT 
    ql.id,
    ql.user_id,
    ql.zone,
    ql.development,
    LEFT(ql.query, 50) as query_preview,
    ql.created_at
FROM query_logs ql
WHERE ql.user_id IS NULL 
   OR ql.user_id NOT IN (SELECT id FROM users)
ORDER BY ql.created_at DESC;

-- 4. Ver logs por zona y desarrollo (útil para debugging)
SELECT 
    ql.zone,
    ql.development,
    ql.user_id,
    u.email as user_email,
    COUNT(*) as total_logs
FROM query_logs ql
LEFT JOIN users u ON ql.user_id = u.id
GROUP BY ql.zone, ql.development, ql.user_id, u.email
ORDER BY ql.zone, ql.development, total_logs DESC;

