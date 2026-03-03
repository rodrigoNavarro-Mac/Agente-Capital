/**
 * =====================================================
 * CONVERSATION KEYWORDS - RECONOCIMIENTO AMPLIADO
 * =====================================================
 * Palabras y frases para reconocer intenciones sin depender solo del LLM.
 * Permite que el bot entienda muchas formas naturales de hablar.
 */

/** Quita acentos usando NFD: en NFD las letras acentuadas son base + carácter combinante (U+0300-U+036F) */
function removeAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Mensaje normalizado (minúsculas, sin acentos) para comparar */
export function normalizeForMatch(text: string): string {
    return removeAccents(text.toLowerCase().trim()).replace(/\s+/g, ' ');
}

function matchesAny(normalized: string, terms: string[]): boolean {
    return terms.some(term => {
        const t = removeAccents(term.toLowerCase());
        return normalized.includes(t) || normalized === t;
    });
}

/* =====================================================
   INTENCIÓN: COMPRAR / CONSTRUIR
===================================================== */
const COMPRAR_TERMS = [
    'comprar', 'quiero comprar', 'me interesa comprar',
    'comprar lote', 'comprar terreno', 'comprar un lote',
    'adquirir', 'adquirir lote', 'adquirir terreno',

    'construir', 'construir mi casa', 'construir casa',
    'quiero construir', 'edificar', 'hacer mi casa',

    'para vivir', 'vivir ahi', 'para vivir ahi',
    'mi casa', 'mi hogar', 'casa propia',
    'patrimonio familiar',

    'lote para casa', 'terreno para casa',
    'terreno para construir', 'para construir',
    'uso personal',

    'mudarnos', 'mudarme', 'cambiarme',
    'donde vivir', 'lugar para vivir',
];

/* =====================================================
   INTENCIÓN: INVERSIÓN
===================================================== */
const INVERTIR_TERMS = [
    'invertir', 'quiero invertir', 'me interesa invertir',
    'inversion', 'inversion inmobiliaria',
    'inversion a futuro', 'oportunidad de inversion',

    'plusvalia', 'rendimiento', 'retorno',
    'roi', 'ganancia', 'reventa',
    'revender', 'comprar para vender',

    'rentar', 'renta', 'poner en renta',
    'generar ingresos', 'flujo',

    'resguardo', 'resguardar capital',
    'diversificar', 'portafolio',

    'terreno para invertir',
    'lote como inversion',
];

/* =====================================================
   INTENCIÓN: SOLO INFORMACIÓN
===================================================== */
const SOLO_INFO_TERMS = [
    'informacion', 'info', 'datos',
    'detalles', 'mas detalles', 'mas informacion',
    'quiero informacion', 'me das informacion',
    'me puedes dar info',

    'precio', 'precios', 'cuanto cuesta',
    'cuanto vale', 'valor del lote',
    'cotizacion', 'cotizar',

    'ubicacion', 'donde esta',
    'mapa', 'amenidades',

    'solo ver', 'solo conocer',
    'explorar opciones',
    'ver opciones', 'ver disponibilidad',

    'mandame brochure', 'brochure',
    'pdf', 'ficha tecnica',
];

/* =====================================================
   RESPUESTAS AFIRMATIVAS
===================================================== */
const AFFIRMATIVE_TERMS = [
    'si', 'claro', 'ok', 'vale', 'va',
    'perfecto', 'listo', 'dale',
    'me interesa', 'quiero',

    'agendar', 'agenda', 'cita',
    'visita', 'visitar', 'ir a ver',
    'conocer el desarrollo',

    'llamada', 'llamen', 'que me llamen',
    'contactame', 'contacto',
    'asesor', 'que me contacten',

    'cuando puedo', 'cuando seria',
    'me gustaria', 'gustaria',

    'vamos', 'jalo', 'me anoto',
];

/* =====================================================
   RESPUESTAS NEGATIVAS / OBJECIONES SUAVES
===================================================== */
const NEGATIVE_TERMS = [
    'no', 'no gracias',
    'no quiero', 'no me interesa',
    'no puedo', 'no tengo tiempo',

    'ahora no', 'luego', 'despues',
    'otro dia', 'mas adelante',

    'estoy ocupado', 'ocupada',
    'mejor no', 'paso',

    'solo estaba viendo',
    'solo curiosidad',
    'no por ahora',

    'muy caro', 'esta caro',
    'no tengo presupuesto',
];

/* =====================================================
   CTA PRIMARIO: VISITAR vs SER CONTACTADO
===================================================== */
const VISITAR_TERMS = [
    'visitar', 'visita', 'ir a ver', 'ir al desarrollo',
    'conocer el desarrollo', 'conocer', 'agendar visita',
    'pasar', 'ir', 'ver el desarrollo', 'recorrido',
];

const CONTACTADO_TERMS = [
    'contacten', 'que me contacten', 'contacto', 'contactame',
    'que un agente', 'que me llame', 'llamada', 'llamada con asesor',
    'por telefono', 'por llamada', 'asesor me contacte',
];

/* =====================================================
   CTA CANAL: WHATSAPP vs LLAMADA
===================================================== */
const WHATSAPP_TERMS = [
    'whatsapp', 'wa', 'por aqui', 'por este medio',
    'por mensaje', 'mensaje', 'escrito',
];

const LLAMADA_TERMS = [
    'llamada', 'llamada telefonica', 'por telefono', 'telefono',
    'que me llamen', 'llamen', 'por llamada',
];

/* =====================================================
   DETECCIÓN PRINCIPAL
===================================================== */

export function matchIntentByKeywords(
    messageText: string
): 'comprar' | 'invertir' | 'solo_info' | 'mixto' | null {

    const n = normalizeForMatch(messageText);

    const isInvertir = matchesAny(n, INVERTIR_TERMS);
    const isComprar = matchesAny(n, COMPRAR_TERMS);
    const isInfo = matchesAny(n, SOLO_INFO_TERMS);

    if (isInvertir && isComprar) return 'mixto';
    if (isInvertir) return 'invertir';
    if (isComprar) return 'comprar';
    if (isInfo) return 'solo_info';

    return null;
}

/* =====================================================
   AFIRMATIVO
===================================================== */
export function matchAffirmativeByKeywords(messageText: string): boolean {
    const n = normalizeForMatch(messageText);

    if (matchesAny(n, AFFIRMATIVE_TERMS)) return true;

    // Respuestas cortas tipo "si", "ok"
    if (/^(si|ok|va|dale|listo|claro)$/.test(n)) return true;

    return false;
}

/* =====================================================
   NEGATIVO
===================================================== */
export function matchNegativeByKeywords(messageText: string): boolean {
    const n = normalizeForMatch(messageText);

    if (matchesAny(n, NEGATIVE_TERMS)) return true;

    // Respuestas ultra cortas tipo "no"
    if (/^no$/.test(n)) return true;

    // "no + palabra corta"
    if (/^no\s+\w{1,4}$/.test(n)) return true;

    return false;
}

/**
 * CTA primario: detecta si el usuario prefiere "visitar" el desarrollo o "ser contactado" por un agente.
 * Si detecta canal explícito (whatsapp/llamada) no se usa para elegir visitar vs contactado; eso se hace en matchCtaCanalByKeywords.
 */
export function matchCtaPrimarioByKeywords(
    messageText: string
): 'visitar' | 'contactado' | null {
    const n = normalizeForMatch(messageText);
    const isVisitar = matchesAny(n, VISITAR_TERMS);
    const isContactado = matchesAny(n, CONTACTADO_TERMS);
    if (isVisitar && !isContactado) return 'visitar';
    if (isContactado && !isVisitar) return 'contactado';
    if (isVisitar && isContactado) return 'contactado'; // ambiguedad: priorizar contactado para preguntar canal
    return null;
}

/**
 * CTA canal: detecta si el usuario prefiere contacto por WhatsApp o por llamada.
 * Solo tiene sentido cuando preferred_action === 'contactado'.
 */
export function matchCtaCanalByKeywords(
    messageText: string
): 'whatsapp' | 'llamada' | null {
    const n = normalizeForMatch(messageText);
    const isWhatsApp = matchesAny(n, WHATSAPP_TERMS);
    const isLlamada = matchesAny(n, LLAMADA_TERMS);
    if (isWhatsApp && !isLlamada) return 'whatsapp';
    if (isLlamada && !isWhatsApp) return 'llamada';
    if (isWhatsApp && isLlamada) return 'llamada'; // ambiguedad: priorizar llamada
    return null;
}
