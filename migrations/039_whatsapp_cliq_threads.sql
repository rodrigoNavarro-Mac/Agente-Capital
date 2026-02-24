-- =====================================================
-- MIGRATION 039: WhatsApp-Cliq bridge threads
-- =====================================================
-- Mapping: (user_phone, development) -> Cliq channel for qualified leads.
-- phone_number_id stored for perfect routing Cliq -> WA.

CREATE TABLE IF NOT EXISTS whatsapp_cliq_threads (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(20) NOT NULL,
    development VARCHAR(100) NOT NULL,
    phone_number_id VARCHAR(50) NOT NULL,
    zoho_lead_id VARCHAR(100),
    assigned_agent_email VARCHAR(255),
    cliq_channel_id VARCHAR(100) NOT NULL,
    cliq_channel_unique_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_cliq_threads_user_dev
    ON whatsapp_cliq_threads(user_phone, development);

CREATE INDEX IF NOT EXISTS idx_whatsapp_cliq_threads_channel_id
    ON whatsapp_cliq_threads(cliq_channel_id);

CREATE OR REPLACE FUNCTION update_whatsapp_cliq_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_whatsapp_cliq_threads_updated_at ON whatsapp_cliq_threads;
CREATE TRIGGER trigger_update_whatsapp_cliq_threads_updated_at
    BEFORE UPDATE ON whatsapp_cliq_threads
    FOR EACH ROW
    EXECUTE PROCEDURE update_whatsapp_cliq_threads_updated_at();
