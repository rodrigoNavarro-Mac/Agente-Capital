-- =====================================================
-- WHATSAPP BRIDGE LOGS (WA <-> Cliq)
-- =====================================================
-- Registro de mensajes/eventos del bridge para mostrar en historial:
-- wa_cliq = contexto/handover enviado al canal Cliq
-- cliq_wa = mensaje del asesor desde Cliq enviado a WhatsApp
-- =====================================================

CREATE TABLE IF NOT EXISTS whatsapp_bridge_logs (
  id SERIAL PRIMARY KEY,
  user_phone VARCHAR(20) NOT NULL,
  development VARCHAR(100) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('wa_cliq', 'cliqq_wa')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE whatsapp_bridge_logs IS 'Logs del bridge WhatsApp-Cliq para historial unificado';
COMMENT ON COLUMN whatsapp_bridge_logs.direction IS 'wa_cliq = enviado a Cliq; cliq_wa = asesor Cliq -> WA';
COMMENT ON COLUMN whatsapp_bridge_logs.content IS 'Texto del mensaje o resumen del evento';

CREATE INDEX IF NOT EXISTS idx_whatsapp_bridge_logs_conversation
  ON whatsapp_bridge_logs(user_phone, development);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bridge_logs_created
  ON whatsapp_bridge_logs(created_at);
