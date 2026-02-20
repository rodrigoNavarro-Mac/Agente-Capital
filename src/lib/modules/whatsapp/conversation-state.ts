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
    | 'CTA_PRIMARIO'             // Micro-decisión: Visita o Llamada
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
    preferred_action?: string;    // 'cita' | 'cotizacion'
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
 * Se ejecuta automáticamente al importar el módulo
 */
async function initConversationsTable(): Promise<void> {
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
        logger.error('Error initializing conversations table', error, {}, 'conversation-state');
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
        logger.error('Error getting conversation', error, { userPhone, development }, 'conversation-state');
        return null;
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

        logger.debug('State updated', { userPhone, development, newState }, 'conversation-state');
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
 * Actualiza la marca de tiempo de última interacción
 */
export async function touchLastInteraction(
    userPhone: string,
    development: string
): Promise<boolean> {
    try {
        await query(
            `UPDATE whatsapp_conversations 
       SET last_interaction = CURRENT_TIMESTAMP 
       WHERE user_phone = $2 AND development = $3`,
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
        const result = await query(
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
