/**
 * Banco de respuestas FAQ por desarrollo y topic.
 * Solo datos — sin lógica.
 */

import type { DevelopmentKey, FaqTopic } from './faq-types';

export const FAQ_BANK: Record<DevelopmentKey, Partial<Record<FaqTopic, string>>> = {
    AMURA: {
        M2: `*AMURA* maneja lotes residenciales dentro de Soluna con superficies de *300 a 401 m²*.

Son lotes escriturables con todos los servicios incluidos.

¿Lo estás evaluando para invertir o para construir?`,

        FINANCIAMIENTO: `En AMURA manejamos *esquemas de pago de hasta 12 meses sin intereses*.

El apartar tu lote es sencillo: un asesor te explica el proceso completo en menos de 10 minutos.

¿Prefieres una llamada o agendar una visita al desarrollo?`,

        ENTREGA: `Los lotes de AMURA son de *entrega inmediata* con casa club y amenidades *100% operativas*.

Puedes escriturar y comenzar tu proyecto desde el primer día.

¿Lo estás viendo para vivir ahí o como inversión?`,

        UBICACION: `AMURA está dentro de *Soluna*, en la *zona Temozón Norte de Mérida* — uno de los corredores con mayor plusvalía en la ciudad.

La ubicación combina tranquilidad residencial con fácil acceso a Periférico y Mérida Centro.

¿Quieres agendar una visita o que un asesor te llame?`,

        AMENIDADES: `Las amenidades de *Soluna* incluyen:

• Piscina y asoleaderos
• Sauna y vestidores
• Cancha de pádel
• Ludoteca y zona de yoga
• Gimnasio equipado
• Lounge bar y salón de eventos
• Juegos infantiles y ciclopista

Todo 100% operativo desde el primer día.

¿Agendamos una visita para que lo conozcas en persona?`,

        PLURIFAMILIAR: `La zona plurifamiliar de AMURA es ideal para desarrolladores:

• Terreno: ~1,483 m²
• Capacidad: hasta 35 viviendas
• COS máximo: 70%
• Altura máxima: 26 m (PB + 5 niveles)

¿Te contacto con un asesor para revisar el esquema a detalle?`,

        PRECIOS: `Los precios en AMURA varían según superficie y ubicación del lote.

Para enviarte una cotización precisa: ¿qué superficie te interesa (*300–401 m²*) o cuál es tu rango de presupuesto?`,

        GENERAL: `Con gusto te oriento. ¿Qué te interesa conocer de AMURA?

• Superficies y medidas (m²)
• Amenidades y servicios
• Ubicación y accesos
• Entrega y disponibilidad
• Plazos de pago y financiamiento
• Precios y cotización`,
    },

    FUEGO: {
        PRECIOS: `Los lotes de *FUEGO* tienen precios *desde $1,283,925 MXN*.

Los precios tienen incremento programado cada 2 meses, así que el mejor momento para apartar es ahora.

¿Quieres que un asesor te envíe la lista de precios actualizada?`,

        M2: `*FUEGO* es un condominio privado dentro de *Terraquia*, en Av. Huayacán, Cancún.

Para que un asesor te comparta la disponibilidad y medidas exactas de los lotes actuales, dime: ¿buscas algo para construir o para invertir?`,

        FINANCIAMIENTO: `En FUEGO contamos con *crédito bancario disponible* y distintos esquemas de pago.

Un asesor puede explicarte las opciones en detalle según tu perfil.

¿Prefieres una llamada o agendar visita al desarrollo?`,

        ENTREGA: `Los lotes de FUEGO tienen *entrega inmediata* con infraestructura 100% terminada:

• Servicios subterráneos
• Seguridad 24/7
• Listo para construir desde el primer día

¿Lo estás viendo para vivir ahí o como inversión?`,

        UBICACION: `*FUEGO* está en *Av. Huayacán, Cancún*, dentro del desarrollo Terraquia — la zona de mayor crecimiento y plusvalía en la ciudad.

Acceso directo desde la avenida principal con seguridad privada.

¿Agendamos una visita para que lo conozcas?`,

        AMENIDADES: `FUEGO es un condominio privado dentro de Terraquia con seguridad 24/7, accesos controlados y servicios subterráneos.

Para el detalle completo de amenidades, un asesor puede compartirte el brochure.

¿Te lo enviamos por llamada o visita?`,

        GENERAL: `Con gusto te oriento. ¿Qué te interesa conocer de FUEGO?

• Precios y cotización
• Medidas disponibles
• Financiamiento y plazos de pago
• Entrega y disponibilidad
• Ubicación y accesos`,
    },

    PUNTO_TIERRA: {
        GENERAL: `Con gusto te oriento. ¿Qué te interesa conocer?

• Tipos de propiedad disponibles
• Precios y cotización
• Financiamiento y plazos
• Ubicación
• Entrega y disponibilidad`,
    },
};
