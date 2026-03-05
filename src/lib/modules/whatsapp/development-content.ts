/**
 * =====================================================
 * WHATSAPP DEVELOPMENT CONTENT (MULTI-DESARROLLO)
 * =====================================================
 * Mensajes y copy por desarrollo. El número de WhatsApp (phone_number_id)
 * determina el desarrollo en channel-router; aquí se define la fuente de
 * respuesta (textos y referencias a medios) por desarrollo.
 */

/**
 * Conjunto de mensajes para un desarrollo.
 * Si agregas una nueva clave aquí, añade su descripción en response-selector.ts
 * (RESPONSE_KEY_DESCRIPTIONS) para que el LLM pueda elegirla correctamente.
 */
export interface DevelopmentMessages {
    BIENVENIDA: string;
    /** Short re-prompt when user sends only a greeting in FILTRO_INTENCION (e.g. "Hola") */
    FILTRO_PREGUNTA: string;
    CONFIRMACION_COMPRA: string;
    CONFIRMACION_INVERSION: string;
    CTA_AYUDA: string;
    /** Primera pregunta CTA: visitar desarrollo o ser contactado por agente */
    CTA_VISITA_O_CONTACTO: string;
    /** Si eligió contactado: por llamada telefónica o por videollamada */
    CTA_CANAL: string;
    SOLICITUD_HORARIO: string;
    /** Fecha y horario para agendar videollamada */
    SOLICITUD_FECHA_HORARIO: string;
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

FUEGO es un condominio privado dentro de Terraquia, ubicado en 📍 Av. Huayacán, Cancún — la zona de mayor crecimiento.

✅ Entrega inmediata  
✅ Crédito bancario disponible  
✅ Plusvalía promedio 14% anual  

Para ayudarte mejor:
¿Buscas invertir 💰 o construir tu hogar 🏡?`,

    FILTRO_PREGUNTA: `Para ayudarte mejor: ¿Buscas invertir 💰 o construir tu hogar 🏡?`,

    CONFIRMACION_COMPRA: `Excelente 🏡✨

Si buscas construir, FUEGO es ideal:
✔ Infraestructura terminada  
✔ Seguridad 24/7 🔐  
✔ Servicios subterráneos  
✔ Listo para empezar a construir  

Aquí puedes comenzar tu proyecto desde el primer día.`,

    CONFIRMACION_INVERSION: `Gran decisión 💰📈

FUEGO está en Av. Huayacán, el corredor con mayor proyección en Cancún.

📊 Zona con gran proyección de plusvalía  
📈 Plusvalía sostenida  
📍 Ubicación estratégica  

Es una inversión sólida y con respaldo real.`,

    CTA_AYUDA: `Para orientarte mejor:

¿Prefieres agendar una visita al desarrollo 🏡 o una llamada breve con un asesor 📞?`,

    CTA_VISITA_O_CONTACTO: `Para orientarte mejor:

¿Quieres visitar el desarrollo 🏡 o que un agente te contacte?`,

    CTA_CANAL: `¿Por llamada telefónica 📞 o por videollamada?`,

    SOLICITUD_HORARIO: `Perfecto 🙌

¿A qué hora te gustaría que te contactemos o que realicemos la llamada?`,

    SOLICITUD_FECHA_HORARIO: `Perfecto 🙌

¿En qué día y horario te gustaría agendar la videollamada?`,

    SOLICITUD_NOMBRE: `Perfecto 🙌

Para asignarte con el asesor correcto:
¿Me compartes tu nombre completo, por favor?`,

    INFO_REINTENTO: `Claro 👌

FUEGO tiene precios desde $1,283,925 MXN y contamos con entrega inmediata 🔑

Los precios tienen incremento programado cada 2 meses ⏳

Para enviarte la información correcta:
¿Lo estás evaluando para invertir 💰 o para vivir 🏡?`,

    HANDOVER_EXITOSO: `Gracias, {NOMBRE} 🙌🔥

Te conecto ahora con un asesor especialista en FUEGO para coordinar siguientes pasos.

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

    BIENVENIDA: `Hola 👋
Soy el asistente de AMURA.

AMURA es un desarrollo residencial con alta proyección de plusvalía, ideal tanto para inversión como para construir tu patrimonio.

Para ayudarte mejor:
¿Te interesa invertir o construir?`,

    FILTRO_PREGUNTA: `Para orientarte mejor:
¿Buscas invertir o construir tu casa?`,

    CONFIRMACION_COMPRA: `Excelente 🏡
Si buscas construir tu patrimonio, AMURA ofrece una ubicación estratégica, plusvalía proyectada y un entorno residencial de alto nivel.`,

    CONFIRMACION_INVERSION: `Excelente decisión 📈
AMURA es una oportunidad sólida de inversión con alta proyección de plusvalía y crecimiento en la zona.`,

    CTA_AYUDA: `Para orientarte mejor:

¿Prefieres conocer el desarrollo en una visita
o que un asesor te explique los detalles en una llamada breve?`,

    CTA_VISITA_O_CONTACTO: `Perfecto.

¿Te gustaría visitar el desarrollo
o prefieres que un asesor te contacte por llamada?`,

    CTA_CANAL: `¿Prefieres que te contactemos por llamada telefónica
o por videollamada?`,

    SOLICITUD_HORARIO: `Perfecto 👍

¿En qué horario te gustaría que coordinemos la visita o la llamada?`,

    SOLICITUD_FECHA_HORARIO: `Perfecto 👍

¿En qué día y horario te gustaría agendar la videollamada?`,

    SOLICITUD_NOMBRE: `Con gusto lo coordinamos.

¿Me compartes tu nombre completo para asignarte con un asesor?`,

    INFO_REINTENTO: `Claro.

Antes de avanzar, solo para entender mejor:
¿Estás buscando esta oportunidad para invertir o para construir tu casa?`,

    HANDOVER_EXITOSO: `Perfecto, {NOMBRE}.

Un asesor de AMURA te contactará en breve para continuar con los siguientes pasos y resolver cualquier duda.`,

    CONFIRMACION_FINAL: `Solo para confirmar:

¿Agendamos una visita al desarrollo
o prefieres una llamada con un asesor?`,

    SALIDA_ELEGANTE: `Gracias por tu interés en AMURA.

Cuando decidas explorar esta oportunidad con más detalle, aquí estaré para ayudarte.`,

    FUERA_HORARIO: `Gracias por escribir.

En breve un asesor de AMURA continuará contigo para brindarte atención personalizada.`

};
/**
 * Mensajes PUNTO TIERRA - Placeholder para tercer desarrollo
 */
const PUNTO_TIERRA_MESSAGES: DevelopmentMessages = {

    BIENVENIDA: `Hola 👋
    Soy el asistente de Punto Tierra.
    
    Tenemos distintas opciones inmobiliarias como casas, departamentos, terrenos y macrolotes para desarrollo.
    
    Para orientarte mejor:
    ¿Qué tipo de propiedad estás buscando?`,
    
    FILTRO_PREGUNTA: `Para ayudarte mejor:
    
    ¿Qué tipo de propiedad te interesa?
    
    • Casa
    • Departamento
    • Terreno
    • Macrolote / desarrollo`,
    
    CONFIRMACION_COMPRA: `Perfecto.
    En Punto Tierra contamos con distintas opciones que podrían ajustarse a lo que buscas.`,
    
    CONFIRMACION_INVERSION: `Excelente.
    Tenemos oportunidades interesantes tanto para inversión patrimonial como para desarrollo.`,
    
    CTA_AYUDA: `Para ayudarte mejor:
    
    ¿Te gustaría conocer algunas opciones disponibles
    o prefieres que un asesor te explique las alternativas?`,
    
    CTA_VISITA_O_CONTACTO: `Perfecto.
    
    ¿Prefieres visitar alguna propiedad
    o que un asesor te contacte para explicarte las opciones?`,
    
    CTA_CANAL: `¿Prefieres que te contactemos por llamada telefónica
    o por videollamada?`,
    
    SOLICITUD_HORARIO: `Perfecto.
    
    ¿En qué horario te gustaría que coordinemos la llamada o la visita?`,
    
    SOLICITUD_FECHA_HORARIO: `Perfecto.
    
    ¿En qué día y horario te gustaría agendar la videollamada?`,
    
    SOLICITUD_NOMBRE: `Con gusto lo coordinamos.
    
    ¿Me compartes tu nombre completo para asignarte con un asesor?`,
    
    INFO_REINTENTO: `Antes de continuar, solo para entender mejor:
    
    ¿Estás buscando una propiedad para vivir
    o una oportunidad de inversión?`,
    
    HANDOVER_EXITOSO: `Perfecto, {NOMBRE}.
    
    Un asesor de Punto Tierra te contactará para mostrarte las opciones que mejor se adapten a lo que buscas.`,
    
    CONFIRMACION_FINAL: `Solo para confirmar:
    
    ¿Agendamos una visita a la propiedad
    o prefieres una llamada con un asesor?`,
    
    SALIDA_ELEGANTE: `Gracias por tu interés en Punto Tierra.
    
    Cuando quieras explorar opciones inmobiliarias, aquí estaré para ayudarte.`,
    
    FUERA_HORARIO: `Gracias por escribir.
    
    En breve un asesor de Punto Tierra continuará contigo para brindarte atención personalizada.`
    
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
