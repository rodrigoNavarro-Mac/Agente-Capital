/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - TEXT CLEANER
 * =====================================================
 * Módulo para limpiar y normalizar texto extraído de
 * documentos PDF, CSV y DOCX.
 */

// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================

/**
 * Limpia y normaliza texto extraído de documentos
 * 
 * @param text - Texto crudo extraído del documento
 * @param options - Opciones de limpieza
 * @returns Texto limpio y normalizado
 */
export function cleanText(
  text: string,
  options: CleaningOptions = {}
): string {
  if (!text) return '';

  const {
    removeHeaders = true,
    removeFooters = true,
    removePageNumbers = true,
    normalizeWhitespace = true,
    removeExtraNewlines = true,
    removeSpecialChars = false,
    toLowerCase = false,
    removeUrls = false,
    removeEmails = false,
    maxConsecutiveNewlines = 2,
  } = options;

  let cleanedText = text;

  // 1. Remover caracteres de control y nulos
  cleanedText = removeControlCharacters(cleanedText);

  // 2. Normalizar saltos de línea
  cleanedText = cleanedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Remover headers comunes de documentos
  if (removeHeaders) {
    cleanedText = removeDocumentHeaders(cleanedText);
  }

  // 4. Remover footers comunes
  if (removeFooters) {
    cleanedText = removeDocumentFooters(cleanedText);
  }

  // 5. Remover números de página
  if (removePageNumbers) {
    cleanedText = removePageNumberPatterns(cleanedText);
  }

  // 6. Remover URLs
  if (removeUrls) {
    cleanedText = cleanedText.replace(
      /https?:\/\/[^\s]+/gi,
      ''
    );
  }

  // 7. Remover emails
  if (removeEmails) {
    cleanedText = cleanedText.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      ''
    );
  }

  // 8. Normalizar espacios en blanco
  if (normalizeWhitespace) {
    // Reemplazar tabs por espacios
    cleanedText = cleanedText.replace(/\t/g, ' ');
    // Remover espacios múltiples
    cleanedText = cleanedText.replace(/ +/g, ' ');
    // Remover espacios al inicio/final de líneas
    cleanedText = cleanedText.split('\n').map(line => line.trim()).join('\n');
  }

  // 9. Reducir saltos de línea consecutivos
  if (removeExtraNewlines) {
    const regex = new RegExp(`\n{${maxConsecutiveNewlines + 1},}`, 'g');
    cleanedText = cleanedText.replace(regex, '\n'.repeat(maxConsecutiveNewlines));
  }

  // 10. Remover caracteres especiales (opcional)
  if (removeSpecialChars) {
    cleanedText = removeSpecialCharacters(cleanedText);
  }

  // 11. Convertir a minúsculas (opcional)
  if (toLowerCase) {
    cleanedText = cleanedText.toLowerCase();
  }

  // 12. Trim final
  cleanedText = cleanedText.trim();

  return cleanedText;
}

// =====================================================
// INTERFACES
// =====================================================

export interface CleaningOptions {
  removeHeaders?: boolean;
  removeFooters?: boolean;
  removePageNumbers?: boolean;
  normalizeWhitespace?: boolean;
  removeExtraNewlines?: boolean;
  removeSpecialChars?: boolean;
  toLowerCase?: boolean;
  removeUrls?: boolean;
  removeEmails?: boolean;
  maxConsecutiveNewlines?: number;
}

// =====================================================
// FUNCIONES DE LIMPIEZA ESPECÍFICAS
// =====================================================

/**
 * Remueve caracteres de control y nulos
 */
function removeControlCharacters(text: string): string {
  // Mantener solo caracteres imprimibles, tabs, newlines y espacios
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Remueve headers comunes de documentos corporativos
 */
function removeDocumentHeaders(text: string): string {
  const headerPatterns = [
    // Fechas en headers
    /^.*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}.*$/gm,
    // "Página X de Y" al inicio
    /^Página\s+\d+\s+de\s+\d+$/gmi,
    /^Page\s+\d+\s+of\s+\d+$/gmi,
    // Headers repetitivos de Capital Plus
    /^Capital\s+Plus.*$/gmi,
    // Líneas de solo guiones o iguales (separadores)
    /^[-=_]{10,}$/gm,
    // Confidencial / Interno
    /^(Confidencial|Interno|Internal|Confidential).*$/gmi,
  ];

  let cleanedText = text;
  headerPatterns.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, '');
  });

  return cleanedText;
}

/**
 * Remueve footers comunes de documentos
 */
function removeDocumentFooters(text: string): string {
  const footerPatterns = [
    // Copyright
    /©.*\d{4}.*$/gmi,
    /Copyright.*\d{4}.*$/gmi,
    // Todos los derechos reservados
    /Todos los derechos reservados.*$/gmi,
    /All rights reserved.*$/gmi,
    // Números de página al final
    /^\d+$/gm,
    // "Página X" solo
    /^Página\s+\d+$/gmi,
    // Información de impresión
    /^Impreso\s+el.*$/gmi,
    /^Printed\s+on.*$/gmi,
  ];

  let cleanedText = text;
  footerPatterns.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, '');
  });

  return cleanedText;
}

/**
 * Remueve patrones de números de página
 */
function removePageNumberPatterns(text: string): string {
  const pagePatterns = [
    // "Página 1 de 10"
    /Página\s+\d+\s+(de|\/)\s+\d+/gi,
    /Page\s+\d+\s+(of|\/)\s+\d+/gi,
    // "Pág. 1"
    /Pág\.?\s*\d+/gi,
    // "P. 1"
    /P\.\s*\d+/gi,
    // "[1]" o "(1)" solos en una línea
    /^\s*[\[\(]\d+[\]\)]\s*$/gm,
    // Números solos al final de línea
    /\s+\d+\s*$/gm,
  ];

  let cleanedText = text;
  pagePatterns.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, '');
  });

  return cleanedText;
}

/**
 * Remueve caracteres especiales manteniendo puntuación básica
 */
function removeSpecialCharacters(text: string): string {
  // Mantener letras, números, espacios y puntuación básica
  return text.replace(/[^\w\s.,;:!?¿¡'"()\-áéíóúñüÁÉÍÓÚÑÜ]/g, ' ');
}

// =====================================================
// FUNCIONES ESPECÍFICAS POR TIPO DE DOCUMENTO
// =====================================================

/**
 * Limpia texto extraído de PDF
 */
export function cleanPDFText(text: string): string {
  let cleanedText = text;

  // Remover artifacts comunes de PDFs
  cleanedText = cleanedText
    // Remover saltos de página (form feed)
    .replace(/\f/g, '\n\n')
    // Remover guiones de división de palabras al final de línea
    .replace(/-\n(\w)/g, '$1')
    // Remover bullets/viñetas mal interpretadas
    .replace(/[•●○◦▪▫]/g, '- ')
    // Remover caracteres de ligadura
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl');

  return cleanText(cleanedText, {
    removeHeaders: true,
    removeFooters: true,
    removePageNumbers: true,
  });
}

/**
 * Limpia texto extraído de CSV
 */
export function cleanCSVText(text: string): string {
  // Para CSV, principalmente normalizar delimitadores y limpiar
  return cleanText(text, {
    removeHeaders: false,
    removeFooters: false,
    removePageNumbers: false,
    normalizeWhitespace: true,
    removeExtraNewlines: true,
    maxConsecutiveNewlines: 1,
  });
}

/**
 * Limpia texto extraído de DOCX
 */
export function cleanDOCXText(text: string): string {
  let cleanedText = text;

  // Remover artifacts de Word
  cleanedText = cleanedText
    // Remover marcadores de campo de Word
    .replace(/\[.*?\]/g, '')
    // Remover referencias cruzadas vacías
    .replace(/\(\s*\)/g, '');

  return cleanText(cleanedText, {
    removeHeaders: true,
    removeFooters: true,
    removePageNumbers: true,
  });
}

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

/**
 * Detecta el idioma predominante del texto (simple)
 */
export function detectLanguage(text: string): 'es' | 'en' | 'unknown' {
  const spanishWords = ['el', 'la', 'de', 'que', 'y', 'en', 'los', 'del', 'las', 'un', 'por', 'con', 'para', 'es'];
  const englishWords = ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'it', 'with', 'as', 'was', 'on', 'are'];

  const words = text.toLowerCase().split(/\s+/);
  
  let spanishCount = 0;
  let englishCount = 0;

  words.forEach(word => {
    if (spanishWords.includes(word)) spanishCount++;
    if (englishWords.includes(word)) englishCount++;
  });

  if (spanishCount > englishCount * 1.5) return 'es';
  if (englishCount > spanishCount * 1.5) return 'en';
  return 'unknown';
}

/**
 * Extrae números y precios del texto
 */
export function extractPrices(text: string): string[] {
  const pricePatterns = [
    // $1,234,567.89 MXN
    /\$[\d,]+\.?\d*\s*(MXN|USD|pesos|dólares)?/gi,
    // 1,234,567 MXN
    /[\d,]+\s*(MXN|USD|pesos|dólares)/gi,
  ];

  const prices: string[] = [];
  pricePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      prices.push(...matches);
    }
  });

  return Array.from(new Set(prices)); // Remover duplicados
}

/**
 * Extrae metros cuadrados del texto
 */
export function extractAreas(text: string): string[] {
  const areaPatterns = [
    // 100 m², 100m2, 100 metros cuadrados
    /[\d,]+\.?\d*\s*(m²|m2|metros?\s*cuadrados?|mts?²?)/gi,
    // 100 sqft, 100 sq ft
    /[\d,]+\.?\d*\s*(sqft|sq\.?\s*ft\.?|square\s*feet)/gi,
  ];

  const areas: string[] = [];
  areaPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      areas.push(...matches);
    }
  });

  return Array.from(new Set(areas));
}

/**
 * Trunca texto a un número máximo de caracteres
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Genera un preview del texto para mostrar en resultados
 */
export function generatePreview(text: string, maxLength: number = 200): string {
  const cleaned = cleanText(text, {
    removeExtraNewlines: true,
    maxConsecutiveNewlines: 1,
  });
  return truncateText(cleaned, maxLength);
}

export default {
  cleanText,
  cleanPDFText,
  cleanCSVText,
  cleanDOCXText,
  detectLanguage,
  extractPrices,
  extractAreas,
  truncateText,
  generatePreview,
};

