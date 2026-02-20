/**
 * =====================================================
 * WHATSAPP DEVELOPMENT CONTENT (MULTI-DESARROLLO)
 * =====================================================
 * Mensajes y copy por desarrollo. El número de WhatsApp (phone_number_id)
 * determina el desarrollo en channel-router; aquí se define la fuente de
 * respuesta (textos y referencias a medios) por desarrollo.
 */

/**
 * Conjunto de mensajes para un desarrollo
 */
export interface DevelopmentMessages {
    BIENVENIDA: string;
    CONFIRMACION_COMPRA: string;
    CONFIRMACION_INVERSION: string;
    CTA_AYUDA: string;
    SOLICITUD_NOMBRE: string;
    INFO_REINTENTO: string;
    HANDOVER_EXITOSO: string;
    CONFIRMACION_FINAL: string;
    SALIDA_ELEGANTE: string;
    FUERA_HORARIO: string;
}

/**
 * Mensajes FUEGO - Desarrollo Cancún (Huayacán)
 */
const FUEGO_MESSAGES: DevelopmentMessages = {
    BIENVENIDA: `Hola
Soy el asistente de FUEGO, un desarrollo privado de lotes residenciales en Av. Huayacán, Cancún

Contamos con lotes desde 159.57 m² y planes de pago de hasta 24 plazos.

Para ayudarte mejor, ¿te interesa invertir o construir?`,
    CONFIRMACION_COMPRA: `Perfecto
Entonces buscas construir tu patrimonio, eso encaja muy bien con lo que ofrece FUEGO.`,
    CONFIRMACION_INVERSION: `Excelente
FUEGO es una de las zonas con mayor plusvalía en Huayacán, ideal para inversión.`,
    CTA_AYUDA: `Para orientarte mejor y darte la información correcta:

¿Te gustaría agendar una visita al desarrollo o prefieres una llamada breve con un asesor?`,
    SOLICITUD_NOMBRE: `Perfecto, con gusto lo coordinamos

Para decirle al asesor a quién debe dirigirse, ¿cuál es tu nombre completo?`,
    INFO_REINTENTO: `Entiendo que quieras revisar detalles primero

FUEGO es una comunidad exclusiva y quiero darte el dato exacto.

¿Estás buscando esta oportunidad para invertir o para vivir?`,
    HANDOVER_EXITOSO: `Gracias, {NOMBRE}

Te voy a conectar con un asesor experto de FUEGO para coordinar los detalles.

Gracias por tu confianza.`,
    CONFIRMACION_FINAL: `Entiendo

¿Entonces confirmamos para coordinar una visita o una llamada?`,
    SALIDA_ELEGANTE: `Entiendo perfectamente

Gracias por tu interés. Si más adelante decides avanzar, aquí estaré para ayudarte.

¡Que tengas un excelente día!`,
    FUERA_HORARIO: `Gracias por escribir
En un momento un asesor de FUEGO continúa contigo.`,
};

/**
 * Mensajes AMURA - Placeholder para segundo desarrollo
 */
const AMURA_MESSAGES: DevelopmentMessages = {
    BIENVENIDA: `Hola
Soy el asistente de AMURA.

Para ayudarte mejor, ¿te interesa invertir o construir?`,
    CONFIRMACION_COMPRA: `Perfecto
Entonces buscas construir tu patrimonio. AMURA te puede interesar.`,
    CONFIRMACION_INVERSION: `Excelente
AMURA es una opción sólida para inversión.`,
    CTA_AYUDA: `Para orientarte mejor:

¿Te gustaría agendar una visita al desarrollo o prefieres una llamada breve con un asesor?`,
    SOLICITUD_NOMBRE: `Perfecto, con gusto lo coordinamos

¿Cuál es tu nombre completo para decirle al asesor?`,
    INFO_REINTENTO: `Entiendo que quieras revisar detalles primero

¿Estás buscando esta oportunidad para invertir o para vivir?`,
    HANDOVER_EXITOSO: `Gracias, {NOMBRE}

Te voy a conectar con un asesor de AMURA para coordinar los detalles.`,
    CONFIRMACION_FINAL: `¿Confirmamos visita o llamada?`,
    SALIDA_ELEGANTE: `Gracias por tu interés. Si más adelante decides avanzar, aquí estaré.`,
    FUERA_HORARIO: `Gracias por escribir. En un momento un asesor de AMURA continúa contigo.`,
};

/**
 * Mensajes PUNTO TIERRA - Placeholder para tercer desarrollo
 */
const PUNTO_TIERRA_MESSAGES: DevelopmentMessages = {
    BIENVENIDA: `Hola
Soy el asistente de Punto Tierra.

¿Te interesa invertir o construir?`,
    CONFIRMACION_COMPRA: `Perfecto. Punto Tierra puede ser una buena opción para ti.`,
    CONFIRMACION_INVERSION: `Excelente. Punto Tierra ofrece oportunidades de inversión.`,
    CTA_AYUDA: `¿Te gustaría agendar una visita o una llamada con un asesor?`,
    SOLICITUD_NOMBRE: `¿Cuál es tu nombre completo para el asesor?`,
    INFO_REINTENTO: `¿Estás buscando esta oportunidad para invertir o para vivir?`,
    HANDOVER_EXITOSO: `Gracias, {NOMBRE}. Un asesor de Punto Tierra te contactará.`,
    CONFIRMACION_FINAL: `¿Confirmamos visita o llamada?`,
    SALIDA_ELEGANTE: `Gracias por tu interés. Aquí estaré si decides avanzar.`,
    FUERA_HORARIO: `Gracias por escribir. Un asesor de Punto Tierra continúa contigo.`,
};

const CONTENT_BY_DEVELOPMENT: Record<string, DevelopmentMessages> = {
    FUEGO: FUEGO_MESSAGES,
    AMURA: AMURA_MESSAGES,
    PUNTO_TIERRA: PUNTO_TIERRA_MESSAGES,
};

/**
 * Devuelve los mensajes del desarrollo. Si el desarrollo no existe, usa FUEGO como fallback.
 */
export function getMessagesForDevelopment(development: string): DevelopmentMessages {
    const key = (development || 'FUEGO').toUpperCase().replace(/\s+/g, '_');
    return CONTENT_BY_DEVELOPMENT[key] ?? FUEGO_MESSAGES;
}
