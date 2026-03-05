import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockValidateWhatsAppPhone = vi.fn();
const mockSendTemplateMessage = vi.fn();

vi.mock('../whatsapp-client', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        ...actual, // mantiene la implementación real de validateMexicanPhone y normalizePhoneToInternational
        validateWhatsAppPhone: (...args: unknown[]) => mockValidateWhatsAppPhone(...args),
        sendTemplateMessage: (...args: unknown[]) => mockSendTemplateMessage(...args),
    };
});

const mockGetConversation = vi.fn();
const mockUpsertConversation = vi.fn();
const mockUpdateState = vi.fn();
const mockMergeUserData = vi.fn();

vi.mock('../conversation-state', () => ({
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
    upsertConversation: (...args: unknown[]) => mockUpsertConversation(...args),
    updateState: (...args: unknown[]) => mockUpdateState(...args),
    mergeUserData: (...args: unknown[]) => mockMergeUserData(...args),
    markQualified: vi.fn(),
}));

const mockIsBusinessHours = vi.fn();

vi.mock('../conversation-flows', () => ({
    isBusinessHours: () => mockIsBusinessHours(),
}));

const mockCreateCliqChannel = vi.fn();
const mockAddBotToCliqChannel = vi.fn();
const mockPostMessageToCliqViaWebhook = vi.fn();

vi.mock('@/lib/services/zoho-cliq', () => ({
    createCliqChannel: (...args: unknown[]) => mockCreateCliqChannel(...args),
    addBotToCliqChannel: (...args: unknown[]) => mockAddBotToCliqChannel(...args),
    postMessageToCliqViaWebhook: (...args: unknown[]) => mockPostMessageToCliqViaWebhook(...args),
}));

const mockUpsertWhatsAppCliqThread = vi.fn();
const mockMarkContextSent = vi.fn();

vi.mock('@/lib/db/whatsapp-cliq', () => ({
    upsertWhatsAppCliqThread: (...args: unknown[]) => mockUpsertWhatsAppCliqThread(...args),
    markContextSent: (...args: unknown[]) => mockMarkContextSent(...args),
}));

vi.mock('@/lib/db/postgres', () => ({
    query: vi.fn(async () => ({ rows: [] })),
    saveBridgeLog: vi.fn(async () => {}),
}));

import { handleZohoLeadCreated } from '../zoho-lead-activation';

// ---------------------------------------------------------------------------
// Shared test params
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
    userPhone: '5219991234567',
    phoneNumberId: '980541871814181',
    development: 'FUEGO',
    leadId: 'zoho-lead-123',
    fullName: 'Juan Pérez',
};

const MOCK_WA_RESPONSE = { messages: [{ id: 'wamid.test123' }] };
const MOCK_CLIQ_CHANNEL = { channel_id: 'ch-abc', unique_name: 'wa-fuego-juan-xyz' };

describe('handleZohoLeadCreated', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetConversation.mockResolvedValue(null);
        mockUpsertConversation.mockResolvedValue({ id: 1 });
        mockUpdateState.mockResolvedValue(true);
        mockMergeUserData.mockResolvedValue(true);
        mockCreateCliqChannel.mockResolvedValue(MOCK_CLIQ_CHANNEL);
        mockAddBotToCliqChannel.mockResolvedValue(true);
        mockPostMessageToCliqViaWebhook.mockResolvedValue({ ok: true });
        mockUpsertWhatsAppCliqThread.mockResolvedValue(undefined);
        mockMarkContextSent.mockResolvedValue(undefined);
    });

    // -------------------------------------------------------------------------
    // A. Invalid phone
    // -------------------------------------------------------------------------
    describe('A. Invalid phone', () => {
        it('returns invalid_phone status, persists disqualified_reason, skips template and Cliq', async () => {
            mockValidateWhatsAppPhone.mockResolvedValue({ valid: false });

            const result = await handleZohoLeadCreated(BASE_PARAMS);

            expect(result.success).toBe(false);
            expect(result.status).toBe('invalid_phone');

            expect(mockSendTemplateMessage).not.toHaveBeenCalled();
            expect(mockCreateCliqChannel).not.toHaveBeenCalled();

            expect(mockUpsertConversation).toHaveBeenCalledWith(
                BASE_PARAMS.userPhone,
                BASE_PARAMS.development,
                expect.objectContaining({
                    user_data: expect.objectContaining({ disqualified_reason: 'invalid_phone' }),
                })
            );
        });
    });

    // -------------------------------------------------------------------------
    // B. Valid phone + business hours
    // -------------------------------------------------------------------------
    describe('B. Valid phone + business hours', () => {
        beforeEach(() => {
            mockValidateWhatsAppPhone.mockResolvedValue({ valid: true, wa_id: BASE_PARAMS.userPhone });
            mockSendTemplateMessage.mockResolvedValue(MOCK_WA_RESPONSE);
            mockIsBusinessHours.mockReturnValue(true);
            process.env.CLIQ_ALWAYS_INVITE_EMAILS = 'agent@example.com';
        });

        afterEach(() => {
            delete process.env.CLIQ_ALWAYS_INVITE_EMAILS;
        });

        it('sends template once, creates Cliq channel, sets CLIENT_ACCEPTA state, does not mark qualified', async () => {
            const result = await handleZohoLeadCreated(BASE_PARAMS);

            expect(result.success).toBe(true);
            expect(result.status).toBe('template_sent_business_hours');

            expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
            expect(mockCreateCliqChannel).toHaveBeenCalledTimes(1);
            expect(mockAddBotToCliqChannel).toHaveBeenCalledTimes(1);
            expect(mockPostMessageToCliqViaWebhook).toHaveBeenCalledTimes(1);

            expect(mockUpdateState).toHaveBeenCalledWith(
                BASE_PARAMS.userPhone,
                BASE_PARAMS.development,
                'CLIENT_ACCEPTA'
            );
        });

        it('does not call markQualified', async () => {
            const { markQualified } = await import('../conversation-state');
            await handleZohoLeadCreated(BASE_PARAMS);
            expect(vi.mocked(markQualified)).not.toHaveBeenCalled();
        });

        it('initializes conversation with source=zoho_crm', async () => {
            await handleZohoLeadCreated(BASE_PARAMS);
            expect(mockUpsertConversation).toHaveBeenCalledWith(
                BASE_PARAMS.userPhone,
                BASE_PARAMS.development,
                expect.objectContaining({
                    state: 'INICIO',
                    user_data: expect.objectContaining({ source: 'zoho_crm' }),
                    is_qualified: false,
                })
            );
        });
    });

    // -------------------------------------------------------------------------
    // C. Valid phone + outside business hours
    // -------------------------------------------------------------------------
    describe('C. Valid phone + outside business hours', () => {
        beforeEach(() => {
            mockValidateWhatsAppPhone.mockResolvedValue({ valid: true, wa_id: BASE_PARAMS.userPhone });
            mockSendTemplateMessage.mockResolvedValue(MOCK_WA_RESPONSE);
            mockIsBusinessHours.mockReturnValue(false);
        });

        it('sends template once, initializes conversation at INICIO, does not create Cliq channel', async () => {
            const result = await handleZohoLeadCreated(BASE_PARAMS);

            expect(result.success).toBe(true);
            expect(result.status).toBe('template_sent_after_hours');

            expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
            expect(mockCreateCliqChannel).not.toHaveBeenCalled();
        });

        it('creates conversation with state=INICIO and source=zoho_crm so FSM continues on user reply', async () => {
            await handleZohoLeadCreated(BASE_PARAMS);

            expect(mockUpsertConversation).toHaveBeenCalledWith(
                BASE_PARAMS.userPhone,
                BASE_PARAMS.development,
                expect.objectContaining({
                    state: 'INICIO',
                    user_data: expect.objectContaining({ source: 'zoho_crm' }),
                    is_qualified: false,
                })
            );

            expect(mockUpdateState).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // D. Template retry logic
    // -------------------------------------------------------------------------
    describe('D. Template send retries', () => {
        beforeEach(() => {
            mockValidateWhatsAppPhone.mockResolvedValue({ valid: true, wa_id: BASE_PARAMS.userPhone });
            mockIsBusinessHours.mockReturnValue(false);
        });

        it('retries and succeeds on 3rd attempt (fails twice then succeeds)', async () => {
            mockSendTemplateMessage
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(MOCK_WA_RESPONSE);

            const result = await handleZohoLeadCreated(BASE_PARAMS);

            expect(result.success).toBe(true);
            expect(result.status).toBe('template_sent_after_hours');
            expect(mockSendTemplateMessage).toHaveBeenCalledTimes(3);
        });

        it('marks unreachable and stops if all retries fail', async () => {
            mockSendTemplateMessage.mockResolvedValue(null);

            const result = await handleZohoLeadCreated(BASE_PARAMS);

            expect(result.success).toBe(false);
            expect(result.status).toBe('unreachable');
            expect(mockSendTemplateMessage).toHaveBeenCalledTimes(3);

            expect(mockCreateCliqChannel).not.toHaveBeenCalled();
            expect(mockUpdateState).not.toHaveBeenCalled();

            expect(mockUpsertConversation).toHaveBeenCalledWith(
                BASE_PARAMS.userPhone,
                BASE_PARAMS.development,
                expect.objectContaining({
                    user_data: expect.objectContaining({ disqualified_reason: 'unreachable' }),
                })
            );
        });
    });
});
