/**
 * =====================================================
 * WHATSAPP CLOUD API - TYPE DEFINITIONS
 * =====================================================
 * Tipos TypeScript para la integración de WhatsApp Cloud API
 */

// =====================================================
// WEBHOOK TYPES
// =====================================================

/**
 * Estructura del webhook de WhatsApp (POST)
 */
export interface WhatsAppWebhookPayload {
    object: string;
    entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
    id: string;
    changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
    value: WhatsAppWebhookValue;
    field: string;
}

export interface WhatsAppWebhookValue {
    messaging_product: string;
    metadata: WhatsAppMetadata;
    contacts?: WhatsAppContact[];
    messages?: WhatsAppMessage[];
    statuses?: WhatsAppStatus[];
}

export interface WhatsAppMetadata {
    display_phone_number: string;
    phone_number_id: string;
}

export interface WhatsAppContact {
    profile: {
        name: string;
    };
    wa_id: string;
}

export interface WhatsAppMessage {
    from: string;
    id: string;
    timestamp: string;
    text?: {
        body: string;
    };
    /** Respuesta a botón (template quick reply, etc.) */
    button?: {
        text?: string;
        payload?: string;
    };
    /** Respuesta a mensaje interactivo (listas, botones) */
    interactive?: {
        type: string;
        button_reply?: { id: string; title: string };
        list_reply?: { id: string; title: string; description?: string };
    };
    type: string;
}

export interface WhatsAppStatus {
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
}

// =====================================================
// CONTEXT SNAPSHOT
// =====================================================

/**
 * Snapshot del contexto del usuario para el agente
 */
export interface ContextSnapshot {
    channel: 'whatsapp';
    phone_number_id: string;
    user_phone: string;
    message: string;
    language: string;
    development: string;
}

// =====================================================
// WHATSAPP CLIENT TYPES
// =====================================================

/**
 * Response de la API de WhatsApp al enviar un mensaje
 */
export interface WhatsAppSendMessageResponse {
    messaging_product: string;
    contacts: Array<{
        input: string;
        wa_id: string;
    }>;
    messages: Array<{
        id: string;
    }>;
}

/**
 * Error de la API de WhatsApp
 */
export interface WhatsAppApiError {
    error: {
        message: string;
        type: string;
        code: number;
        error_data?: {
            details: string;
        };
        fbtrace_id: string;
    };
}

// =====================================================
// CHANNEL ROUTER TYPES
// =====================================================

/**
 * Configuración del router de canales
 * Mapea phone_number_id → development
 */
export interface ChannelConfig {
    [phoneNumberId: string]: string;
}

/**
 * Resultado del routing
 */
export interface RoutingResult {
    development: string;
    zone: string;
}

// =====================================================
// DATABASE TYPES
// =====================================================

/**
 * Log de WhatsApp para PostgreSQL
 */
export interface WhatsAppLog {
    user_phone: string;
    development: string;
    message: string;
    response: string;
    phone_number_id: string;
}
