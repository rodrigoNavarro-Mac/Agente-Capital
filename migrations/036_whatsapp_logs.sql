-- =====================================================
-- WHATSAPP LOGS TABLE
-- =====================================================
-- Tabla para almacenar logs de mensajes y respuestas de WhatsApp
-- Migración: 036_whatsapp_logs.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id SERIAL PRIMARY KEY,
  user_phone VARCHAR(20) NOT NULL,
  development VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  phone_number_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE whatsapp_logs IS 'Logs de mensajes y respuestas de WhatsApp';
COMMENT ON COLUMN whatsapp_logs.user_phone IS 'Número de teléfono del usuario (formato internacional sin +)';
COMMENT ON COLUMN whatsapp_logs.development IS 'Desarrollo asociado al mensaje';
COMMENT ON COLUMN whatsapp_logs.message IS 'Mensaje enviado por el usuario';
COMMENT ON COLUMN whatsapp_logs.response IS 'Respuesta generada por el agente';
COMMENT ON COLUMN whatsapp_logs.phone_number_id IS 'ID del número de WhatsApp Business';
COMMENT ON COLUMN whatsapp_logs.created_at IS 'Timestamp del mensaje';

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone ON whatsapp_logs(user_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_development ON whatsapp_logs(development);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created ON whatsapp_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone_number ON whatsapp_logs(phone_number_id);

-- Verificar tabla creada
SELECT 'whatsapp_logs table created successfully' AS status;
