-- =====================================================
-- MIGRATION 040: Track if initial context was sent to Cliq channel
-- =====================================================
-- When the channel exists but context was never sent (e.g. created by retry
-- without a prior handover message), we send it once and set this timestamp.

ALTER TABLE whatsapp_cliq_threads
    ADD COLUMN IF NOT EXISTS context_sent_at TIMESTAMP WITH TIME ZONE NULL;

COMMENT ON COLUMN whatsapp_cliq_threads.context_sent_at IS 'When the initial handover context message was posted to this channel; NULL = not sent yet.';
