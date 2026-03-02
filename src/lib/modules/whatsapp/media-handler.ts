/**
 * =====================================================
 * WHATSAPP MEDIA HANDLER
 * =====================================================
 * Configuración y helpers para envío de imágenes por desarrollo
 */

/**
 * Configuración de medios por desarrollo
 *
 * Notas:
 * - Todas las propiedades son URLs (por ejemplo, de Vercel Blob).
 * - Para amenidades se recomienda usar siempre amenitiesGalleryUrls (múltiples fotos).
 */
export interface DevelopmentMedia {
    /** Imagen principal del desarrollo (se usa en bienvenida). */
    heroImageUrl?: string;
    /** URL del brochure en PDF. */
    brochureUrl?: string;
    /** Imagen única de amenidades (legacy). Preferir amenitiesGalleryUrls. */
    amenitiesImageUrl?: string;
    /** Galería de imágenes de amenidades (multiples fotos). */
    amenitiesGalleryUrls?: string[];
    /** Imagen de ubicación (se envía en /ubicacion). */
    locationImageUrl?: string;
    /** Texto descriptivo de la ubicación (dirección, referencias). */
    locationText?: string;
    /** URL de Google Maps u otro mapa. */
    mapsUrl?: string;
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
        brochureUrl: 'https://mdb3blnhtc41axtd.public.blob.vercel-storage.com/Presentacio%CC%81n%20FUEGO%20-%20FINAL25.pdf',
        amenitiesGalleryUrls: [
            'https://mdb3blnhtc41axtd.public.blob.vercel-storage.com/AmenidadesFUEGO1.jpeg',
            'https://mdb3blnhtc41axtd.public.blob.vercel-storage.com/AmenidadesFUEGO2.jpeg',
            'https://mdb3blnhtc41axtd.public.blob.vercel-storage.com/AmenidadesFUEGO3.jpeg',
            'https://mdb3blnhtc41axtd.public.blob.vercel-storage.com/AmenidadesFUEGO4.jpeg',
        ],
        locationImageUrl:'https://mdb3blnhtc41axtd.public.blob.vercel-storage.com/AmenidadesFUEGO4.jpeg',
        locationText: 'Terraquia, desarrollo inmobiliario en Av. Huayacán, Cancún, Quintana Roo',
        mapsUrl: 'https://maps.app.goo.gl/ZmbGprLz6Wp6651Y7',
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

/**
 * Obtiene la lista de URLs de imágenes de amenidades para un desarrollo.
 * Prioriza amenitiesGalleryUrls (múltiples imágenes) y, si no existe,
 * hace fallback a amenitiesImageUrl como arreglo de un solo elemento.
 */
export function getAmenitiesImages(development: string): string[] {
    const media = DEVELOPMENT_MEDIA[development.toUpperCase()];
    if (!media) {
        return [];
    }
    if (media.amenitiesGalleryUrls && media.amenitiesGalleryUrls.length > 0) {
        return media.amenitiesGalleryUrls;
    }
    if (media.amenitiesImageUrl) {
        return [media.amenitiesImageUrl];
    }
    return [];
}

/**
 * Obtiene la información de ubicación para un desarrollo:
 * - locationImageUrl: imagen para acompañar el mensaje de ubicación.
 * - locationText: texto con dirección / referencias.
 * - mapsUrl: URL de Google Maps u otro mapa.
 */
export function getLocationMedia(development: string): {
    imageUrl?: string;
    locationText?: string;
    mapsUrl?: string;
} {
    const media = DEVELOPMENT_MEDIA[development.toUpperCase()];
    if (!media) {
        return {};
    }
    return {
        imageUrl: media.locationImageUrl,
        locationText: media.locationText,
        mapsUrl: media.mapsUrl,
    };
}
