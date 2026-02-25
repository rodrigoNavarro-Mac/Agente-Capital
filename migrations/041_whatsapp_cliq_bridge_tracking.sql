-- =====================================================
-- MIGRATION 041: Bridge Cliq <-> WA tracking for debugging
-- =====================================================
-- Track last Cliq->WA send and last error per channel so the dashboard
-- can show bidirectional status and help debug failures.

ALTER TABLE whatsapp_cliq_threads
    ADD COLUMN IF NOT EXISTS last_cliq_wa_sent_at TIMESTAMP WITH TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS last_cliq_wa_error TEXT NULL;

COMMENT ON COLUMN whatsapp_cliq_threads.last_cliq_wa_sent_at IS 'When we last successfully sent a message from Cliq to WhatsApp for this channel.';
COMMENT ON COLUMN whatsapp_cliq_threads.last_cliq_wa_error IS 'Last error message when Cliq->WA send failed for this channel; NULL if last send succeeded.';
