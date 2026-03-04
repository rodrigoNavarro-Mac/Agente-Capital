-- Tabla de deduplicación de mensajes WhatsApp
-- Previene procesar el mismo mensaje múltiples veces cuando WhatsApp
-- reintenta el webhook (duplicados simultáneos o retries con delay).
-- La PRIMARY KEY garantiza atomicidad vía ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS whatsapp_message_dedup (
    message_id VARCHAR(200) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice para limpiar entradas viejas eficientemente
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_dedup_created_at
    ON whatsapp_message_dedup (created_at);

COMMENT ON TABLE whatsapp_message_dedup IS
    'Registro de IDs de mensajes WhatsApp ya procesados para prevenir duplicados';
