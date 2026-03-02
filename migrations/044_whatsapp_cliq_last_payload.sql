-- =====================================================
-- MIGRATION 044: Store last raw Cliq webhook payload per thread
-- =====================================================
-- Objetivo: poder ver desde el panel de Debug el payload completo
-- que envía Zoho Cliq al webhook, para encontrar IDs como
-- CT_1424569707581655259_895451510 sin depender solo del ID interno O...

ALTER TABLE whatsapp_cliq_threads
    ADD COLUMN IF NOT EXISTS last_cliq_raw_payload JSONB NULL;

COMMENT ON COLUMN whatsapp_cliq_threads.last_cliq_raw_payload IS
    'Último payload bruto recibido desde el webhook de Cliq para este thread (para depuración).';

