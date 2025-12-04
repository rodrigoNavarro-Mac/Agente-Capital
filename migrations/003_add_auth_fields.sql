-- =====================================================
-- CAPITAL PLUS AI AGENT - ADD AUTHENTICATION FIELDS
-- =====================================================
-- Migración para agregar campos de autenticación a usuarios
-- 
-- Ejecutar con: psql -U usuario -d capital_plus_agent -f migrations/003_add_auth_fields.sql
-- =====================================================

-- Agregar campos de autenticación a la tabla users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN users.password_hash IS 'Hash de la contraseña del usuario (bcrypt)';
COMMENT ON COLUMN users.email_verified IS 'Si el email del usuario ha sido verificado';
COMMENT ON COLUMN users.last_login IS 'Última vez que el usuario inició sesión';
COMMENT ON COLUMN users.failed_login_attempts IS 'Número de intentos fallidos de login';
COMMENT ON COLUMN users.locked_until IS 'Fecha hasta la cual la cuenta está bloqueada por intentos fallidos';

-- Crear tabla para tokens de recuperación de contraseña
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE password_reset_tokens IS 'Tokens para recuperación de contraseña';
COMMENT ON COLUMN password_reset_tokens.token IS 'Token único para recuperación';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Fecha de expiración del token (24 horas)';
COMMENT ON COLUMN password_reset_tokens.used IS 'Si el token ya fue usado';

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Crear tabla para sesiones de usuario
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE user_sessions IS 'Sesiones activas de usuarios';
COMMENT ON COLUMN user_sessions.session_token IS 'Token de sesión (JWT o similar)';
COMMENT ON COLUMN user_sessions.refresh_token IS 'Token para refrescar la sesión';
COMMENT ON COLUMN user_sessions.expires_at IS 'Fecha de expiración de la sesión';

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Función para limpiar tokens expirados (se puede ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM password_reset_tokens 
    WHERE expires_at < NOW() OR used = true;
    
    DELETE FROM user_sessions 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_tokens IS 'Limpia tokens y sesiones expiradas';

