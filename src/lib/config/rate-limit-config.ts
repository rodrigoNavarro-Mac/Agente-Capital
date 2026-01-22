/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - RATE LIMITING CONFIG
 * =====================================================
 * Definición pura de límites, separada de la implementación
 * para permitir su uso en Edge y Node sin conflictos de dependencias.
 */

// Tipo para las claves de rate limits
export type RateLimitKey = 'rag-query' | 'rag-feedback' | 'upload' | 'auth-login' | 'auth-refresh' | 'zoho' | 'api';

/**
 * Define los límites de rate limiting para cada tipo de endpoint.
 * Los límites se aplican por usuario (identificado por userId o IP).
 * 
 * Formato: { requests: número, window: 'tiempo' }
 * - requests: número máximo de requests permitidos
 * - window: ventana de tiempo (ej: '10s', '1m', '1h')
 */
export const RATE_LIMITS: Record<RateLimitKey, { requests: number; window: string }> = {
    // Endpoints de consulta RAG (costosos en recursos)
    'rag-query': {
        requests: 30, // 30 requests
        window: '1m', // por minuto
    },

    // Endpoints de autenticación (protección contra brute force)
    'auth-login': {
        requests: 5, // 5 intentos
        window: '15m', // cada 15 minutos
    },

    'auth-refresh': {
        requests: 20, // 20 refreshes
        window: '1m', // por minuto
    },

    // Endpoints de upload (procesamiento pesado)
    'upload': {
        requests: 10, // 10 uploads
        window: '1h', // por hora
    },

    // Endpoints de Zoho (llamadas externas costosas)
    'zoho': {
        requests: 50, // 50 requests
        window: '1m', // por minuto
    },

    // Endpoints generales de API
    'api': {
        requests: 100, // 100 requests
        window: '1m', // por minuto
    },

    // Endpoints de feedback (menos frecuentes)
    'rag-feedback': {
        requests: 20, // 20 feedbacks
        window: '1m', // por minuto
    },
};
