-- Migration 046: Historial de transiciones de estado para conversaciones WhatsApp
-- Registra cada cambio de estado con el mensaje disparador, clave de respuesta, quién decidió y razonamiento.

CREATE TABLE IF NOT EXISTS whatsapp_state_transitions (
  id SERIAL PRIMARY KEY,
  user_phone VARCHAR(20) NOT NULL,
  development VARCHAR(100) NOT NULL,
  from_state VARCHAR(50),          -- NULL = estado inicial
  to_state VARCHAR(50) NOT NULL,
  trigger_message TEXT,            -- mensaje del usuario que causó la transición
  response_key VARCHAR(100),       -- clave del banco de mensajes que se envió
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'system',  -- 'llm' | 'keyword' | 'fsm' | 'anti_loop' | 'reset' | 'system'
  reasoning TEXT,                  -- justificación breve
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wa_state_transitions_phone_dev_at
  ON whatsapp_state_transitions(user_phone, development, created_at DESC);
