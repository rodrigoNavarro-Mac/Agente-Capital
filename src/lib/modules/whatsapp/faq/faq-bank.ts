/**
 * Banco de respuestas FAQ por desarrollo y topic.
 * Solo datos — sin lógica.
 */

import type { DevelopmentKey, FaqTopic } from './faq-types';

export const FAQ_BANK: Record<DevelopmentKey, Partial<Record<FaqTopic, string>>> = {
    AMURA: {
        M2: `En AMURA son lotes residenciales dentro de Soluna.
Superficies: de 300 a 401 m².
¿Lo estás viendo para invertir o para construir?`,

        FINANCIAMIENTO: `En AMURA manejan financiamiento hasta 9 meses.
¿Prefieres que un asesor te contacte o agendamos visita?`,

        ENTREGA: `La entrega está programada para marzo de 2026.
¿Te interesa invertir o construir?`,

        UBICACION: `AMURA está dentro de Soluna (zona Temozón Norte, Mérida).
¿Quieres agendar visita o llamada con un asesor?`,

        AMENIDADES: `Amenidades Soluna: piscina/asoleaderos, sauna, vestidores, pádel, ludoteca, yoga, gimnasio, lounge bar, salón de eventos, juegos infantiles y ciclopista.
¿Visita o llamada?`,

        PLURIFAMILIAR: `Zona plurifamiliar para desarrolladores: terreno ~1483.38 m², 35 viviendas, COS máx 70%, altura máx 26 m (PB + 5).
¿Te contacto con un asesor para ver esquema?`,

        PRECIOS: `Del brochure no viene una tabla de precios.
Para cotizar: ¿qué superficie te interesa (300–401 m²) o cuál es tu rango de presupuesto?`,

        GENERAL: `Te comparto la info que tengo. ¿Qué te interesa: m², amenidades, ubicación, entrega, financiamiento o precios?`,
    },

    FUEGO: {
        GENERAL: `Te comparto la info que tengo. ¿Qué te interesa: m², amenidades, ubicación, entrega, financiamiento o precios?`,
    },

    PUNTO_TIERRA: {
        GENERAL: `Te comparto la info que tengo. ¿Qué te interesa: m², amenidades, ubicación, entrega, financiamiento o precios?`,
    },
};
