-- =====================================================
-- WHATSAPP LOGS - MÉTRICAS DE DESEMPEÑO
-- =====================================================
-- Añade columnas para medir: hora recibido, hora respuesta, hora visto (leído)
-- Migración: 038_whatsapp_logs_performance.sql
-- =====================================================

-- Hora en que recibimos el mensaje del usuario (webhook recibido o timestamp de Meta)
ALTER TABLE whatsapp_logs
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS response_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS incoming_message_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS outbound_message_id VARCHAR(100);

-- Rellenar received_at con created_at para filas existentes (retrocompatibilidad)
UPDATE whatsapp_logs
SET received_at = created_at
WHERE received_at IS NULL AND created_at IS NOT NULL;

COMMENT ON COLUMN whatsapp_logs.received_at IS 'Hora en que se recibió el mensaje del usuario (webhook)';
COMMENT ON COLUMN whatsapp_logs.response_at IS 'Hora en que se envió la primera respuesta al usuario';
COMMENT ON COLUMN whatsapp_logs.seen_at IS 'Hora en que el usuario vio/leyó nuestra respuesta (status read de Meta)';
COMMENT ON COLUMN whatsapp_logs.incoming_message_id IS 'ID del mensaje entrante (Meta)';
COMMENT ON COLUMN whatsapp_logs.outbound_message_id IS 'ID del mensaje saliente (Meta); usado para actualizar seen_at';

-- Índice para actualizar seen_at por outbound_message_id cuando llega status "read"
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_outbound_message_id ON whatsapp_logs(outbound_message_id)
  WHERE outbound_message_id IS NOT NULL;

SELECT 'whatsapp_logs performance columns added' AS status;
