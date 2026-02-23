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
    BIENVENIDA: `Hola 👋🔥

Soy el asistente oficial de *FUEGO*.

FUEGO es un condominio privado de solo 63 lotes dentro de Terraquia, ubicado en 📍 Av. Huayacán, Cancún — la zona de mayor crecimiento.

✅ Entrega inmediata  
✅ Desde 161 m²  
✅ Crédito bancario disponible  
✅ Plusvalía promedio 14% anual  

Para ayudarte mejor:
¿Buscas invertir 💰 o construir tu hogar 🏡?`,

    CONFIRMACION_COMPRA: `Excelente 🏡✨

Si buscas construir, FUEGO es ideal:
✔ Infraestructura terminada  
✔ Seguridad 24/7 🔐  
✔ Servicios subterráneos  
✔ Listo para empezar a construir  

Aquí puedes comenzar tu proyecto desde el primer día.`,

    CONFIRMACION_INVERSION: `Gran decisión 💰📈

FUEGO está en Av. Huayacán, el corredor con mayor proyección en Cancún.

📊 Zona proyectada a superar los $10,500/m² hacia 2028  
📈 Plusvalía sostenida  
📍 Ubicación estratégica  

Es una inversión sólida y con respaldo real.`,

    CTA_AYUDA: `Para enviarte disponibilidad actual y opciones:

¿Prefieres agendar una visita al desarrollo 🏡 o una llamada breve con un asesor 📞?`,

    SOLICITUD_NOMBRE: `Perfecto 🙌

Para asignarte con el asesor correcto:
¿Me compartes tu nombre completo, por favor?`,

    INFO_REINTENTO: `Claro 👌

FUEGO tiene precios desde $1,283,925 MXN y contamos con entrega inmediata 🔑

Los precios tienen incremento programado cada 2 meses ⏳

Para enviarte la información correcta:
¿Lo estás evaluando para invertir 💰 o para vivir 🏡?`,

    HANDOVER_EXITOSO: `Gracias, {NOMBRE} 🙌🔥

Te conecto ahora con un asesor especialista en FUEGO para revisar disponibilidad y siguientes pasos.

En breve continúa contigo.`,

    CONFIRMACION_FINAL: `Perfecto 👍

Entonces confirmamos para coordinar {VISITA_O_LLAMADA} 📅

Un asesor te contactará en breve para definir horario.`,

    SALIDA_ELEGANTE: `Entiendo 😊

Gracias por tu interés en FUEGO 🔥

Cuando decidas avanzar o tengas alguna duda, aquí estaré para ayudarte.`,

    FUERA_HORARIO: `Gracias por escribir 🙌

Nuestro horario es de 8:30 a.m. a 8:30 p.m. ⏰  
Un asesor continuará contigo a primera hora.`
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
