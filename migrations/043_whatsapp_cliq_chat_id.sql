-- =====================================================
-- MIGRATION 043: Add cliq_chat_id to whatsapp_cliq_threads
-- =====================================================
-- Guardar el ID de chat real de Cliq (CT_..._companyId) para poder
-- construir URLs correctas hacia el canal, independiente del ID interno O...

ALTER TABLE whatsapp_cliq_threads
    ADD COLUMN IF NOT EXISTS cliq_chat_id TEXT NULL;

COMMENT ON COLUMN whatsapp_cliq_threads.cliq_chat_id IS
    'Zoho Cliq chat id (ej. CT_1424569707581655259_895451510) usado en la URL /company/{id}/chats/{chat_id}.';

