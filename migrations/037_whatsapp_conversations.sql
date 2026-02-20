-- =====================================================
-- MIGRATION 037: WhatsApp Conversations State Table
-- =====================================================
-- Tabla para gestionar el estado de conversaciones de WhatsApp
-- y la calificación de leads

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(20) NOT NULL,
    development VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    user_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_interaction TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_qualified BOOLEAN NOT NULL DEFAULT false,
    zoho_lead_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice único para evitar duplicados por usuario y desarrollo
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conversations_user_dev 
    ON whatsapp_conversations(user_phone, development);

-- Índice para consultas por última interacción
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_interaction 
    ON whatsapp_conversations(last_interaction);

-- Índice para consultas por estado
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_state 
    ON whatsapp_conversations(state);

-- Índice para leads calificados
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_qualified 
    ON whatsapp_conversations(is_qualified) WHERE is_qualified = true;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_whatsapp_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_whatsapp_conversations_updated_at ON whatsapp_conversations;
CREATE TRIGGER trigger_update_whatsapp_conversations_updated_at
    BEFORE UPDATE ON whatsapp_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_conversations_updated_at();
