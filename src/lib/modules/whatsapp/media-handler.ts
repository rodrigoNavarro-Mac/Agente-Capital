/**
 * =====================================================
 * WHATSAPP MEDIA HANDLER
 * =====================================================
 * Configuración y helpers para envío de imágenes por desarrollo
 */

/**
 * Configuración de medios por desarrollo
 */
export interface DevelopmentMedia {
    heroImageUrl?: string;
    brochureUrl?: string;       // PDF brochure
    amenitiesImageUrl?: string;
    locationImageUrl?: string;
}

/**
 * Nombre del archivo PDF brochure por desarrollo (para envío por WhatsApp)
 */
export const DEVELOPMENT_BROCHURE_FILENAME: Record<string, string> = {
    FUEGO: 'Brochure-FUEGO.pdf',
    AMURA: 'Brochure-AMURA.pdf',
    PUNTO_TIERRA: 'Brochure-PuntoTierra.pdf',
};

/**
 * Configuración de medios por desarrollo.
 * heroImageUrl: imagen principal (se envía después de la bienvenida si está definida).
 * brochureUrl: PDF del brochure (se envía tras confirmar interés si está definida).
 */
export const DEVELOPMENT_MEDIA: Record<string, DevelopmentMedia> = {
    FUEGO: {
        heroImageUrl: 'https://via.placeholder.com/1200x800/1a472a/ffffff?text=FUEGO+Cancun',
        brochureUrl: undefined, // Agregar URL pública del PDF cuando esté disponible
        amenitiesImageUrl: undefined,
        locationImageUrl: undefined,
    },
    AMURA: {
        heroImageUrl: undefined,
        brochureUrl: undefined,
    },
    PUNTO_TIERRA: {
        heroImageUrl: undefined,
        brochureUrl: undefined,
    },
};

/**
 * Obtiene la URL de la imagen hero de un desarrollo
 */
export function getHeroImage(development: string): string | null {
    const media = DEVELOPMENT_MEDIA[development];
    return media?.heroImageUrl || null;
}

/**
 * Verifica si un desarrollo tiene hero image configurada
 */
export function hasHeroImage(development: string): boolean {
    const heroImage = getHeroImage(development);
    return !!heroImage;
}

/**
 * Obtiene la URL del brochure PDF de un desarrollo
 */
export function getBrochure(development: string): string | undefined {
    const media = DEVELOPMENT_MEDIA[development.toUpperCase()];
    return media?.brochureUrl;
}

/**
 * Verifica si un desarrollo tiene brochure configurado
 */
export function hasBrochure(development: string): boolean {
    const brochure = getBrochure(development);
    return !!brochure;
}

/**
 * Nombre del archivo para el brochure del desarrollo (para enviar por WhatsApp)
 */
export function getBrochureFilename(development: string): string {
    const key = (development || '').toUpperCase().replace(/\s+/g, '_');
    return DEVELOPMENT_BROCHURE_FILENAME[key] || `Brochure-${development || 'desarrollo'}.pdf`;
}
