import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.fn();
vi.mock('@/lib/db/postgres', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));

import { deleteConversationFull } from '../conversation-state';

const PHONE = '5219991234567';
const DEV = 'FUEGO';
const CHANNEL_ID = 'cliq-channel-abc';

function makeQueryOk(rows: Record<string, unknown>[] = []) {
    return Promise.resolve({ rows, rowCount: rows.length });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('deleteConversationFull', () => {
    it('elimina todas las tablas y devuelve cliq_channel_id cuando existe thread', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ cliq_channel_id: CHANNEL_ID }], rowCount: 1 }) // SELECT thread
            .mockResolvedValue(makeQueryOk()); // todos los DELETE

        const result = await deleteConversationFull(PHONE, DEV);

        expect(result.success).toBe(true);
        expect(result.cliq_channel_id).toBe(CHANNEL_ID);
        expect(result.deleted.bridge_logs).toBe(true);
        expect(result.deleted.cliq_thread).toBe(true);
        expect(result.deleted.logs).toBe(true);
        expect(result.deleted.conversation).toBe(true);

        // Verifica el orden: bridge_logs → cliq_threads → logs → conversations
        const calls = mockQuery.mock.calls.map((c) => c[0] as string);
        expect(calls[0]).toContain('SELECT cliq_channel_id');
        expect(calls[1]).toContain('whatsapp_bridge_logs');
        expect(calls[2]).toContain('whatsapp_cliq_threads');
        expect(calls[3]).toContain('whatsapp_logs');
        expect(calls[4]).toContain('whatsapp_conversations');
    });

    it('devuelve cliq_channel_id null cuando no hay thread', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT sin resultado
            .mockResolvedValue(makeQueryOk());

        const result = await deleteConversationFull(PHONE, DEV);

        expect(result.success).toBe(true);
        expect(result.cliq_channel_id).toBeNull();
    });

    it('sigue eliminando si whatsapp_bridge_logs no existe (tabla faltante)', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })                          // SELECT thread
            .mockRejectedValueOnce(new Error('relation "whatsapp_bridge_logs" does not exist')) // bridge_logs falla
            .mockResolvedValue(makeQueryOk());                                          // resto OK

        const result = await deleteConversationFull(PHONE, DEV);

        expect(result.success).toBe(true);
        expect(result.deleted.bridge_logs).toBe(false); // falló pero continuó
        expect(result.deleted.cliq_thread).toBe(true);
        expect(result.deleted.logs).toBe(true);
        expect(result.deleted.conversation).toBe(true);
    });

    it('devuelve success=false si falla el DELETE principal de conversaciones', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT thread
            .mockResolvedValueOnce(makeQueryOk())              // bridge_logs OK
            .mockResolvedValueOnce(makeQueryOk())              // cliq_threads OK
            .mockResolvedValueOnce(makeQueryOk())              // logs OK
            .mockRejectedValueOnce(new Error('DB connection lost')); // conversations falla

        const result = await deleteConversationFull(PHONE, DEV);

        expect(result.success).toBe(false);
        expect(result.error).toContain('DB connection lost');
    });
});
