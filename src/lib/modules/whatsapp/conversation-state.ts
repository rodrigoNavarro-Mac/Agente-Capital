/**
 * =====================================================
 * WHATSAPP CONVERSATION STATE MANAGEMENT
 * =====================================================
 * Funciones para gestionar el estado de conversaciones
 * y datos de usuarios en PostgreSQL
 */

import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';

/**
 * Estados posibles de la conversación - Flujo FUEGO
 */
export type ConversationState =
    | 'INICIO'                    // Primer mensaje
    | 'FILTRO_INTENCION'         // ¿Qué te interesa? (Comprar/Invertir/Solo ver)
    | 'INFO_REINTENTO'           // Segunda oportunidad para curiosos
    | 'CTA_PRIMARIO'             // Micro-decisión: Visita o que te contacte un agente
    | 'CTA_CANAL'                // Si contactado: elegir canal WhatsApp o llamada
    | 'SOLICITUD_HORARIO'        // Pedir horario preferido de contacto antes del nombre
    | 'SOLICITUD_NOMBRE'         // Pedir nombre antes de handover
    | 'CLIENT_ACCEPTA'           // Handover, Lead en Zoho
    | 'ENVIO_BROCHURE'           // (Legacy) Enviar PDF brochure
    | 'REVALIDACION_INTERES'     // (Legacy) ¿Cambió de opinión después del brochure?
    | 'VALIDACION_PRODUCTO'      // (Legacy) Aclarar que son LOTES
    | 'PERFIL_COMPRA'            // (Legacy) ¿Cómo usarás el lote?
    | 'CALIFICACION_PRESUPUESTO' // (Legacy) Rango de inversión
    | 'OFERTA_PLAN_PAGOS'        // (Legacy) Ofrecer financiamiento
    | 'CALIFICACION_URGENCIA'    // (Legacy) Timeframe de decisión
    | 'SOLICITUD_ACCION'         // (Legacy) CTA: Cita o Cotización
    | 'HANDOVER_ASESOR'          // (Legacy) Transferir a humano
    | 'SALIDA_ELEGANTE'          // No califica - despedida
    | 'CONVERSACION_LIBRE';      // Post-handover (opcional)

/**
 * Calidad del lead
 */
export type LeadQuality = 'ALTO' | 'MEDIO' | 'BAJO';

/**
 * Datos del usuario recolectados durante la conversación
 */
export interface UserData {
    nombre?: string;
    intencion?: string;           // 'comprar' | 'invertir' | 'solo_info'
    perfil_compra?: string;       // 'construir_casa' | 'inversion' | 'no_claro'
    presupuesto?: string;         // Rango o monto
    urgencia?: string;            // '0-3m' | '3-6m' | '6-12m' | 'explorando'
    /** Macro: 'visita' = ir al desarrollo | 'contactado' = que un agente lo contacte */
    preferred_action?: string;    // 'visita' | 'contactado' (legacy: 'cita' | 'cotizacion')
    /** Solo si preferred_action === 'contactado': 'whatsapp' | 'llamada' */
    preferred_channel?: string;
    horario_preferido?: string;   // Respuesta libre: a qué hora le gustaría ser contactado
    lead_quality?: LeadQuality;   // Scoring automático
    disqualified_reason?: string; // Razón de descalificación
    [key: string]: any;
}

/**
 * Registro de conversación
 */
export interface Conversation {
    id: number;
    user_phone: string;
    development: string;
    state: ConversationState;
    user_data: UserData;
    last_interaction: Date;
    is_qualified: boolean;
    zoho_lead_id: string | null;
    lead_quality: LeadQuality | null;
    disqualified_reason: string | null;
    preferred_action: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Inicializa la tabla whatsapp_conversations si no existe
 * Se ejecuta automáticamente al importar el módulo (solo si hay URL de DB; en build suele no haber).
 */
async function initConversationsTable(): Promise<void> {
    const hasDb = (process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? '').trim().length > 0;
    if (!hasDb) {
        return;
    }
    try {
        await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id SERIAL PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        development VARCHAR(100) NOT NULL,
        state VARCHAR(50) NOT NULL,
        user_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_interaction TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_qualified BOOLEAN NOT NULL DEFAULT false,
        zoho_lead_id VARCHAR(100),
        lead_quality VARCHAR(10),
        disqualified_reason TEXT,
        preferred_action VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conversations_user_dev 
        ON whatsapp_conversations(user_phone, development);
    `, []);

        logger.debug('Conversations table initialized', {}, 'conversation-state');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const stack = (error instanceof Error ? error.stack : undefined) ?? '';
        const isConnectionRefused = msg.includes('ECONNREFUSED') || stack.includes('ECONNREFUSED');
        if (isConnectionRefused) {
            logger.debug('DB not available during init (e.g. build time)', {}, 'conversation-state');
        } else {
            logger.error('Error initializing conversations table', error, {}, 'conversation-state');
        }
    }
}

// Auto-init al cargar el módulo
initConversationsTable();


/**
 * Obtiene la conversación actual de un usuario en un desarrollo
 */
export async function getConversation(
    userPhone: string,
    development: string
): Promise<Conversation | null> {
    try {
        const result = await query<Conversation>(
            `SELECT * FROM whatsapp_conversations 
       WHERE user_phone = $1 AND development = $2`,
            [userPhone, development]
        );

        return result.rows[0] || null;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isMissingTable = msg.includes('whatsapp_conversations') && msg.includes('does not exist');
        logger.error('Error getting conversation', error, { userPhone: userPhone.substring(0, 6) + '***', development }, 'conversation-state');
        if (isMissingTable) {
            console.warn('[WhatsApp] TABLA whatsapp_conversations NO EXISTE. El bot siempre repetira la bienvenida. Ejecuta migracion 037 en Supabase SQL Editor.');
            logger.warn('Tabla whatsapp_conversations no existe. Ejecuta migración 037 en la base de datos (Supabase SQL Editor) para que el flujo avance.', {}, 'conversation-state');
        }
        return null;
    }
}

/** Parámetros para listar conversaciones recientes (depuración / vista de estados) */
export interface RecentConversationRow {
    id: number;
    user_phone: string;
    development: string;
    state: ConversationState;
    last_interaction: Date;
    is_qualified: boolean;
    zoho_lead_id: string | null;
    user_data: UserData;
    created_at: Date;
    updated_at: Date;
    /** Canal Cliq creado para esta conversación (si existe thread) */
    cliq_channel_id?: string | null;
    cliq_channel_unique_name?: string | null;
    /** Chat id real (CT_..._companyId) para URL de navegador */
    cliq_chat_id?: string | null;
    /** Email del asesor asignado (desde thread o Zoho Owner) */
    assigned_agent_email?: string | null;
    /** Cuando se envió contexto WA->Cliq al canal */
    context_sent_at?: string | null;
    /** Último envío exitoso Cliq->WA */
    last_cliq_wa_sent_at?: string | null;
    /** Último error al enviar Cliq->WA (null si el último envío fue ok) */
    last_cliq_wa_error?: string | null;
    /** Número de intercambios (mensajes bot) para métricas/KPIs */
    interaction_count?: number;
    /** Segundos desde primer mensaje del usuario hasta primera respuesta (desde whatsapp_logs) */
    first_response_secs?: number | null;
}

/** Options for filtering recent conversations by role/scope */
export interface GetRecentConversationsOptions {
    /** Filter by list of developments (e.g. user's allowed developments) */
    developments?: string[];
    /** Filter by assigned agent email (e.g. "my leads" only) */
    assignedAgentEmail?: string;
}

/**
 * Lista conversaciones recientes ordenadas por última interacción (para depuración / UI de estados).
 * Supports optional single development (legacy) or options.developments + options.assignedAgentEmail.
 */
export async function getRecentConversations(
    limit: number = 50,
    development?: string,
    options?: GetRecentConversationsOptions
): Promise<RecentConversationRow[]> {
    try {
        const cols = `c.id, c.user_phone, c.development, c.state, c.last_interaction, c.is_qualified, c.zoho_lead_id, c.user_data, c.created_at, c.updated_at,
                      t.cliq_channel_id, t.cliq_channel_unique_name, t.cliq_chat_id, t.assigned_agent_email,
                      t.context_sent_at, t.last_cliq_wa_sent_at, t.last_cliq_wa_error,
                      (SELECT COUNT(*)::int FROM whatsapp_logs w WHERE w.user_phone = c.user_phone AND w.development = c.development) AS interaction_count,
                      (SELECT EXTRACT(EPOCH FROM (w.response_at - w.received_at))::double precision FROM whatsapp_logs w WHERE w.user_phone = c.user_phone AND w.development = c.development AND w.received_at IS NOT NULL AND w.response_at IS NOT NULL ORDER BY w.created_at ASC LIMIT 1) AS first_response_secs`;
        const baseFrom = `FROM whatsapp_conversations c
               LEFT JOIN whatsapp_cliq_threads t ON t.user_phone = c.user_phone AND t.development = c.development`;
        const params: unknown[] = [];
        const conditions: string[] = [];
        let paramIndex = 1;

        if (options?.developments?.length) {
            conditions.push(`LOWER(c.development) = ANY($${paramIndex})`);
            params.push(options.developments.map((d) => d.toLowerCase()));
            paramIndex++;
        } else if (development) {
            conditions.push(`c.development = $${paramIndex}`);
            params.push(development);
            paramIndex++;
        }

        if (options?.assignedAgentEmail) {
            conditions.push(`t.assigned_agent_email = $${paramIndex}`);
            params.push(options.assignedAgentEmail);
            paramIndex++;
        }

        params.push(limit);
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT ${cols} ${baseFrom} ${whereClause} ORDER BY c.last_interaction DESC LIMIT $${paramIndex}`;
        const result = await query<RecentConversationRow>(sql, params);
        return result.rows || [];
    } catch (error) {
        logger.error('Error getting recent conversations', error, { limit, development, options }, 'conversation-state');
        return [];
    }
}

/** KPI aggregates for supervisor dashboard (same filters as getRecentConversations) */
export interface ConversationKPIs {
    total: number;
    active: number;
    handover: number;
    noResponse15m: number;
    withError: number;
    conversionPct: number;
    slaAvgMs: number | null;
    firstResponseAvgMs: number | null;
}

/**
 * Compute KPI counts and averages for the conversation list (same filters as getRecentConversations).
 * Active = last_interaction in last 24h and state != SALIDA_ELEGANTE.
 * Handover = CLIENT_ACCEPTA with cliq_channel_id. NoResponse15m = last_interaction > 15 min ago, not closed.
 */
export async function getConversationKPIs(
    development?: string,
    options?: GetRecentConversationsOptions
): Promise<ConversationKPIs> {
    const empty: ConversationKPIs = {
        total: 0,
        active: 0,
        handover: 0,
        noResponse15m: 0,
        withError: 0,
        conversionPct: 0,
        slaAvgMs: null,
        firstResponseAvgMs: null,
    };
    try {
        const baseFrom = `FROM whatsapp_conversations c
               LEFT JOIN whatsapp_cliq_threads t ON t.user_phone = c.user_phone AND t.development = c.development`;
        const params: unknown[] = [];
        const conditions: string[] = [];
        let paramIndex = 1;

        if (options?.developments?.length) {
            conditions.push(`LOWER(c.development) = ANY($${paramIndex})`);
            params.push(options.developments.map((d) => d.toLowerCase()));
            paramIndex++;
        } else if (development) {
            conditions.push(`c.development = $${paramIndex}`);
            params.push(development);
            paramIndex++;
        }

        if (options?.assignedAgentEmail) {
            conditions.push(`t.assigned_agent_email = $${paramIndex}`);
            params.push(options.assignedAgentEmail);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countSql = `SELECT
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE c.state != 'SALIDA_ELEGANTE' AND c.last_interaction > NOW() - INTERVAL '24 hours')::int as active,
            COUNT(*) FILTER (WHERE c.state = 'CLIENT_ACCEPTA' AND t.cliq_channel_id IS NOT NULL)::int as handover,
            COUNT(*) FILTER (WHERE c.state = 'CLIENT_ACCEPTA' AND t.cliq_channel_id IS NOT NULL AND (t.last_cliq_wa_sent_at IS NULL OR t.last_cliq_wa_sent_at < c.last_interaction) AND c.last_interaction < NOW() - INTERVAL '15 minutes')::int as no_response_15m,
            COUNT(*) FILTER (WHERE t.last_cliq_wa_error IS NOT NULL AND t.last_cliq_wa_error != '')::int as with_error,
            COUNT(*) FILTER (WHERE c.is_qualified = true)::int as qualified
            ${baseFrom} ${whereClause}`;
        const countResult = await query<{
            total: number;
            active: number;
            handover: number;
            no_response_15m: number;
            with_error: number;
            qualified: number;
        }>(countSql, params);
        const row = countResult.rows[0];
        if (!row) return empty;

        const total = Number(row.total) || 0;
        const qualified = Number(row.qualified) || 0;

        let slaAvgMs: number | null = null;
        const devFilter = options?.developments?.length
            ? 'LOWER(w.development) = ANY($1)'
            : development
                ? 'w.development = $1'
                : null;
        const logParams = devFilter ? (options?.developments?.length ? [options.developments.map((d) => d.toLowerCase())] : [development]) : [];
        try {
            const logWhere = devFilter ? ` WHERE ${devFilter} AND w.response_at IS NOT NULL AND w.received_at IS NOT NULL` : ' WHERE w.response_at IS NOT NULL AND w.received_at IS NOT NULL';
            const avgSql = `SELECT AVG(EXTRACT(EPOCH FROM (w.response_at - w.received_at)) * 1000)::bigint as avg_ms FROM whatsapp_logs w${logWhere}`;
            const avgResult = await query<{ avg_ms: string | null }>(avgSql, logParams);
            const avgStr = avgResult.rows[0]?.avg_ms;
            if (avgStr != null) slaAvgMs = parseInt(avgStr, 10);
        } catch {
            // whatsapp_logs may not have received_at/response_at
        }

        return {
            total,
            active: Number(row.active) || 0,
            handover: Number(row.handover) || 0,
            noResponse15m: Number(row.no_response_15m) || 0,
            withError: Number(row.with_error) || 0,
            conversionPct: total > 0 ? Math.round((qualified / total) * 100) : 0,
            slaAvgMs,
            firstResponseAvgMs: slaAvgMs,
        };
    } catch (error) {
        logger.error('Error getting conversation KPIs', error, { development, options }, 'conversation-state');
        return empty;
    }
}

/**
 * Crea o actualiza una conversación
 */
export async function upsertConversation(
    userPhone: string,
    development: string,
    updates: Partial<Omit<Conversation, 'id' | 'user_phone' | 'development' | 'created_at' | 'updated_at'>>
): Promise<Conversation | null> {
    try {
        const result = await query<Conversation>(
            `INSERT INTO whatsapp_conversations 
       (user_phone, development, state, user_data, is_qualified, zoho_lead_id, last_interaction)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (user_phone, development) 
       DO UPDATE SET
         state = COALESCE($3, whatsapp_conversations.state),
         user_data = COALESCE($4, whatsapp_conversations.user_data),
         is_qualified = COALESCE($5, whatsapp_conversations.is_qualified),
         zoho_lead_id = COALESCE($6, whatsapp_conversations.zoho_lead_id),
         last_interaction = CURRENT_TIMESTAMP
       RETURNING *`,
            [
                userPhone,
                development,
                updates.state || 'INICIO',
                JSON.stringify(updates.user_data || {}),
                updates.is_qualified !== undefined ? updates.is_qualified : false,
                updates.zoho_lead_id || null,
            ]
        );

        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error upserting conversation', error, { userPhone, development }, 'conversation-state');
        return null;
    }
}

/**
 * Actualiza el estado de una conversación
 */
export async function updateState(
    userPhone: string,
    development: string,
    newState: ConversationState
): Promise<boolean> {
    try {
        await query(
            `UPDATE whatsapp_conversations 
       SET state = $1, last_interaction = CURRENT_TIMESTAMP 
       WHERE user_phone = $2 AND development = $3`,
            [newState, userPhone, development]
        );

        logger.info('State updated', { userPhone: userPhone.substring(0, 5) + '***', development, newState }, 'conversation-state');
        return true;
    } catch (error) {
        logger.error('Error updating state', error, { userPhone, development, newState }, 'conversation-state');
        return false;
    }
}

/**
 * Fusiona datos de usuario con los existentes
 */
export async function mergeUserData(
    userPhone: string,
    development: string,
    patch: Partial<UserData>
): Promise<boolean> {
    try {
        await query(
            `UPDATE whatsapp_conversations 
       SET user_data = user_data || $1::jsonb,
           last_interaction = CURRENT_TIMESTAMP
       WHERE user_phone = $2 AND development = $3`,
            [JSON.stringify(patch), userPhone, development]
        );

        logger.debug('User data merged', { userPhone, development, patch }, 'conversation-state');
        return true;
    } catch (error) {
        logger.error('Error merging user data', error, { userPhone, development }, 'conversation-state');
        return false;
    }
}

/**
 * Actualiza la marca de tiempo de última interacción (p. ej. cuando se envía mensaje Cliq -> WA).
 */
export async function touchLastInteraction(
    userPhone: string,
    development: string
): Promise<boolean> {
    try {
        await query(
            `UPDATE whatsapp_conversations 
       SET last_interaction = CURRENT_TIMESTAMP 
       WHERE user_phone = $1 AND development = $2`,
            [userPhone, development]
        );
        return true;
    } catch (error) {
        logger.error('Error touching last interaction', error, { userPhone, development }, 'conversation-state');
        return false;
    }
}

/**
 * Marca una conversación como calificada
 */
export async function markQualified(
    userPhone: string,
    development: string,
    zohoLeadId?: string
): Promise<void> {
    try {
        await query(
            `UPDATE whatsapp_conversations 
       SET is_qualified = true,
           zoho_lead_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_phone = $2 AND development = $3`,
            [zohoLeadId || null, userPhone, development]
        );

        logger.debug('Conversation marked as qualified', { userPhone, development, zohoLeadId }, 'conversation-state');
    } catch (error) {
        logger.error('Error marking conversation as qualified', error, { userPhone, development }, 'conversation-state');
    }
}

/**
 * Reinicia una conversación (útil para desarrollo/testing)
 * Elimina todos los datos y vuelve al estado INICIO
 */
export async function resetConversation(
    userPhone: string,
    development: string
): Promise<boolean> {
    try {
        const _result = await query(
            `DELETE FROM whatsapp_conversations 
       WHERE user_phone = $1 AND development = $2`,
            [userPhone, development]
        );

        logger.info('Conversation reset', { userPhone, development }, 'conversation-state');
        return true;
    } catch (error) {
        logger.error('Error resetting conversation', error, { userPhone, development }, 'conversation-state');
        return false;
    }
}
