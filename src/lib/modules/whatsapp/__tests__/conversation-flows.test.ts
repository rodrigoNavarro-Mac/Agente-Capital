/**
 * Flow tests for WhatsApp conversation (handleIncomingMessage).
 * Uses mocks for DB, LLM, Zoho, Cliq, media. No real WhatsApp API calls.
 * Asserts state transitions and outbound messages the bot would send.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Silence logger and console during flow tests for readable output
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));
import type { ConversationState } from '../conversation-state';
import type { UserData } from '../conversation-state';
import { handleIncomingMessage } from '../conversation-flows';
import type { IncomingMessageContext } from '../conversation-flows';
import { getMessagesForDevelopment } from '../development-content';

// ---------------------------------------------------------------------------
// In-memory store for conversation state (replaces DB in tests)
// ---------------------------------------------------------------------------
type StoredConversation = {
  state: ConversationState;
  user_data: UserData;
  is_qualified: boolean;
};
const store = new Map<string, StoredConversation>();

function key(phone: string, dev: string): string {
  return `${phone}|${dev}`;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('../conversation-state', () => ({
  getConversation: vi.fn(async (userPhone: string, development: string) => {
    const c = store.get(key(userPhone, development));
    if (!c) return null;
    return {
      id: 1,
      user_phone: userPhone,
      development,
      state: c.state,
      user_data: c.user_data,
      last_interaction: new Date(),
      is_qualified: c.is_qualified,
      zoho_lead_id: null,
      lead_quality: null,
      disqualified_reason: null,
      preferred_action: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }),
  upsertConversation: vi.fn(async (
    userPhone: string,
    development: string,
    updates: { state?: ConversationState; user_data?: UserData; is_qualified?: boolean }
  ) => {
    const k = key(userPhone, development);
    const existing = store.get(k);
    const next: StoredConversation = {
      state: updates.state ?? existing?.state ?? 'INICIO',
      user_data: { ...existing?.user_data, ...updates.user_data },
      is_qualified: updates.is_qualified ?? existing?.is_qualified ?? false,
    };
    store.set(k, next);
    return {
      id: 1,
      user_phone: userPhone,
      development,
      state: next.state,
      user_data: next.user_data,
      last_interaction: new Date(),
      is_qualified: next.is_qualified,
      zoho_lead_id: null,
      lead_quality: null,
      disqualified_reason: null,
      preferred_action: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }),
  updateState: vi.fn(async (userPhone: string, development: string, newState: ConversationState) => {
    const k = key(userPhone, development);
    const c = store.get(k);
    if (c) {
      store.set(k, { ...c, state: newState });
    }
  }),
  mergeUserData: vi.fn(async (userPhone: string, development: string, patch: Partial<UserData>) => {
    const k = key(userPhone, development);
    const c = store.get(k);
    if (c) {
      store.set(k, { ...c, user_data: { ...c.user_data, ...patch } });
    }
  }),
  markQualified: vi.fn(async () => {}),
  resetConversation: vi.fn(async (userPhone: string, development: string) => {
    store.delete(key(userPhone, development));
  }),
}));

// LLM: return null so FSM/keywords path is always used (deterministic)
vi.mock('../intent-classifier', () => ({
  classifyIntent: vi.fn(async () => null),
  classifyCtaPrimario: vi.fn(async () => null),
  classifyCtaCanal: vi.fn(async () => null),
}));

// Response selector: return null so we use FSM fallback
vi.mock('../response-selector', () => ({
  selectResponseAndState: vi.fn(async () => null),
  getResponseText: vi.fn((_dev: string, key: string) => `[${key}]`),
}));

// No real Zoho/Cliq/media/DB
vi.mock('@/lib/services/zoho-crm', () => ({
  createZohoLeadRecord: vi.fn(async () => ({ zoho_lead_id: 'test-lead', owner_email: null })),
  searchZohoLeadsByPhone: vi.fn(async () => null),
  getZohoLeadById: vi.fn(async () => null),
}));
vi.mock('@/lib/services/zoho-cliq', () => ({
  createCliqChannel: vi.fn(async () => ({ channel_id: 'ch1', unique_name: 'ch1' })),
  addBotToCliqChannel: vi.fn(async () => {}),
  postMessageToCliqViaWebhook: vi.fn(async () => {}),
}));
vi.mock('../media-handler', () => ({
  getHeroImage: vi.fn(() => null),
  getBrochure: vi.fn(() => null),
  getBrochureFilename: vi.fn(() => 'Brochure.pdf'),
}));
vi.mock('@/lib/db/whatsapp-cliq', () => ({
  upsertWhatsAppCliqThread: vi.fn(async () => {}),
  getCliqThreadByUserAndDev: vi.fn(async () => null),
  markContextSent: vi.fn(async () => {}),
}));
vi.mock('@/lib/db/postgres', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  saveBridgeLog: vi.fn(async () => {}),
  saveStateTransition: vi.fn(async () => {}),
}));
vi.mock('../channel-router', () => ({
  getPhoneNumberIdByDevelopment: vi.fn(() => 'phone-id-1'),
}));
vi.mock('../response-personalizer', () => ({
  personalizeResponse: vi.fn(async (_msg: string, base: string) => base),
}));

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------
const DEV = 'FUEGO';
const PHONE = '5219991234567';

function ctx(messageText: string): IncomingMessageContext {
  return {
    development: DEV,
    zone: 'test',
    phoneNumberId: 'phone-id-1',
    userPhone: PHONE,
    messageText,
  };
}

/** Set conversation state in store (for tests that start from a given state) */
function setState(state: ConversationState, userData: UserData = {}): void {
  store.set(key(PHONE, DEV), { state, user_data: userData, is_qualified: false });
}

/** Get current state from store (after a run) */
function getState(): ConversationState | undefined {
  return store.get(key(PHONE, DEV))?.state;
}

/** Helper: first text message the bot would send */
function firstText(result: Awaited<ReturnType<typeof handleIncomingMessage>>): string | undefined {
  const msg = result.outboundMessages?.find((m) => m.type === 'text');
  return msg?.type === 'text' ? msg.text : undefined;
}

/** Helper: all text messages */
function allTexts(result: Awaited<ReturnType<typeof handleIncomingMessage>>): string[] {
  return (result.outboundMessages ?? []).filter((m) => m.type === 'text').map((m) => (m as { text: string }).text);
}

describe('conversation-flows', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    consoleLogSpy.mockClear();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  describe('/reset', () => {
    it('returns reset message and clears state', async () => {
      setState('CTA_PRIMARIO');
      const res = await handleIncomingMessage(ctx('/reset'));
      expect(firstText(res)).toContain('reiniciada');
      expect(getState()).toBeUndefined();
    });
  });

  describe('new conversation', () => {
    it('sends BIENVENIDA and moves to FILTRO_INTENCION when user says "hola"', async () => {
      const res = await handleIncomingMessage(ctx('hola'));
      const messages = getMessagesForDevelopment(DEV);
      expect(firstText(res)).toContain(messages.BIENVENIDA.slice(0, 20));
      expect(res.nextState).toBe('FILTRO_INTENCION');
      expect(getState()).toBe('FILTRO_INTENCION');
    });
  });

  describe('FILTRO_INTENCION -> CTA_PRIMARIO', () => {
    it('on "invertir" sends CONFIRMACION_INVERSION and CTA_VISITA_O_CONTACTO, state CTA_PRIMARIO', async () => {
      setState('FILTRO_INTENCION');
      const res = await handleIncomingMessage(ctx('invertir'));
      expect(allTexts(res).some((t) => /inversion|plusvalia|inversión|plusvalía/i.test(t))).toBe(true);
      expect(allTexts(res).some((t) => t.includes('visitar') || t.includes('contacte'))).toBe(true);
      expect(res.nextState).toBe('CTA_PRIMARIO');
      expect(getState()).toBe('CTA_PRIMARIO');
    });

    it('on "construir" sends CONFIRMACION_COMPRA and CTA, state CTA_PRIMARIO', async () => {
      setState('FILTRO_INTENCION');
      const res = await handleIncomingMessage(ctx('quiero construir'));
      expect(allTexts(res).length).toBeGreaterThanOrEqual(2);
      expect(res.nextState).toBe('CTA_PRIMARIO');
    });
  });

  describe('CTA_PRIMARIO -> visitar', () => {
    it('on "visitar" sends SOLICITUD_HORARIO and moves to SOLICITUD_HORARIO', async () => {
      setState('CTA_PRIMARIO');
      const res = await handleIncomingMessage(ctx('visitar'));
      expect(firstText(res)).toMatch(/hora|horario|contactemos/);
      expect(res.nextState).toBe('SOLICITUD_HORARIO');
      expect(getState()).toBe('SOLICITUD_HORARIO');
    });
  });

  describe('CTA_PRIMARIO -> llamada (short-circuit, no horario)', () => {
    it('on "llamada" sends SOLICITUD_NOMBRE and moves to SOLICITUD_NOMBRE', async () => {
      setState('CTA_PRIMARIO');
      const res = await handleIncomingMessage(ctx('por llamada'));
      expect(firstText(res)).toMatch(/nombre|compartes/);
      expect(res.nextState).toBe('SOLICITUD_NOMBRE');
      expect(getState()).toBe('SOLICITUD_NOMBRE');
    });
  });

  describe('CTA_PRIMARIO -> contactado -> CTA_CANAL', () => {
    it('on "contactar un agente" sends CTA_CANAL and moves to CTA_CANAL', async () => {
      setState('CTA_PRIMARIO');
      const res = await handleIncomingMessage(ctx('contactar un agente'));
      expect(firstText(res)).toMatch(/llamada|videollamada/);
      expect(res.nextState).toBe('CTA_CANAL');
      expect(getState()).toBe('CTA_CANAL');
    });
  });

  describe('CTA_CANAL -> llamada -> SOLICITUD_NOMBRE', () => {
    it('on "llamada" sends SOLICITUD_NOMBRE (no horario)', async () => {
      setState('CTA_CANAL');
      const res = await handleIncomingMessage(ctx('llamada'));
      expect(firstText(res)).toMatch(/nombre|compartes/);
      expect(res.nextState).toBe('SOLICITUD_NOMBRE');
    });
  });

  describe('CTA_CANAL -> videollamada -> SOLICITUD_HORARIO', () => {
    it('on "videollamada" sends SOLICITUD_FECHA_HORARIO and moves to SOLICITUD_HORARIO', async () => {
      setState('CTA_CANAL');
      const res = await handleIncomingMessage(ctx('videollamada'));
      const text = firstText(res) ?? '';
      expect(text).toMatch(/día|horario|videollamada/);
      expect(res.nextState).toBe('SOLICITUD_HORARIO');
    });
  });

  describe('SOLICITUD_HORARIO -> SOLICITUD_NOMBRE', () => {
    it('on any text sends SOLICITUD_NOMBRE', async () => {
      setState('SOLICITUD_HORARIO');
      const res = await handleIncomingMessage(ctx('mañana a las 10'));
      expect(firstText(res)).toMatch(/nombre|compartes/);
      expect(res.nextState).toBe('SOLICITUD_NOMBRE');
    });
  });

  describe('SOLICITUD_NOMBRE -> name too short', () => {
    it('on name < 3 chars re-asks and stays in SOLICITUD_NOMBRE', async () => {
      setState('SOLICITUD_NOMBRE');
      const res = await handleIncomingMessage(ctx('Jo'));
      expect(firstText(res)).toMatch(/nombre/);
      expect(res.nextState).toBe('SOLICITUD_NOMBRE');
    });
  });

  describe('SOLICITUD_NOMBRE -> handover', () => {
    it('on valid name creates lead and sends brochure + HANDOVER_EXITOSO, state CLIENT_ACCEPTA', async () => {
      setState('SOLICITUD_NOMBRE', { horario_preferido: '10am' });
      const res = await handleIncomingMessage(ctx('Juan Pérez García'));
      expect(res.nextState).toBe('CLIENT_ACCEPTA');
      expect(res.shouldCreateLead).toBe(true);
      const texts = allTexts(res);
      expect(texts.some((t) => t.includes('Juan') || t.includes('Gracias'))).toBe(true);
      // May include document (brochure) + text
      expect(res.outboundMessages?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('CTA_PRIMARIO -> SALIDA_ELEGANTE', () => {
    it('on "no gracias" sends SALIDA_ELEGANTE', async () => {
      setState('CTA_PRIMARIO');
      const res = await handleIncomingMessage(ctx('no gracias'));
      expect(firstText(res)).toMatch(/Gracias|entendemos|interés/i);
      expect(res.nextState).toBe('SALIDA_ELEGANTE');
    });
  });

  describe('FILTRO_INTENCION -> greeting (start from 0)', () => {
    it('when user sends only greeting (e.g. "Holaaa") responds with BIENVENIDA and stays in FILTRO_INTENCION', async () => {
      setState('FILTRO_INTENCION');
      const res = await handleIncomingMessage(ctx('Holaaa'));
      expect(res.nextState).toBe('FILTRO_INTENCION');
      const text = firstText(res);
      expect(text).toBeDefined();
      // BIENVENIDA contains the intent question, not INFO_REINTENTO
      expect(text).toMatch(/invertir|construir|hogar/i);
      expect(text).not.toMatch(/Claro|Antes de avanzar/);
    });
  });

  describe('FILTRO_INTENCION -> INFO_REINTENTO (solo info)', () => {
    it('on "solo estoy viendo" sends INFO_REINTENTO', async () => {
      setState('FILTRO_INTENCION');
      // Usa un mensaje de "solo info" que no dispara el FAQ router
      const res = await handleIncomingMessage(ctx('solo estoy viendo opciones'));
      expect(res.nextState).toBe('INFO_REINTENTO');
      expect(firstText(res)).toMatch(/precio|invertir|vivir/i);
    });
  });

  describe('full flow: new -> invertir -> contactado -> videollamada -> horario -> nombre', () => {
    it('transitions correctly through all states without calling WhatsApp API', async () => {
      // 1. Hola -> FILTRO_INTENCION
      let res = await handleIncomingMessage(ctx('hola'));
      expect(getState()).toBe('FILTRO_INTENCION');

      // 2. Invertir -> CTA_PRIMARIO
      res = await handleIncomingMessage(ctx('invertir'));
      expect(getState()).toBe('CTA_PRIMARIO');

      // 3. Contactado -> CTA_CANAL
      res = await handleIncomingMessage(ctx('que me contacte un agente'));
      expect(getState()).toBe('CTA_CANAL');

      // 4. Videollamada -> SOLICITUD_HORARIO
      res = await handleIncomingMessage(ctx('videollamada'));
      expect(getState()).toBe('SOLICITUD_HORARIO');

      // 5. Horario -> SOLICITUD_NOMBRE
      res = await handleIncomingMessage(ctx('jueves 4pm'));
      expect(getState()).toBe('SOLICITUD_NOMBRE');

      // 6. Nombre -> CLIENT_ACCEPTA
      res = await handleIncomingMessage(ctx('María López'));
      expect(getState()).toBe('CLIENT_ACCEPTA');
      expect(res.shouldCreateLead).toBe(true);
    });
  });
});
