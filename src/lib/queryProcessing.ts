/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - QUERY PROCESSING
 * =====================================================
 * Módulo para procesar y mejorar queries antes de la búsqueda RAG:
 * - Corrección ortográfica
 * - Expansión semántica
 * - Normalización de términos
 */

// =====================================================
// DICCIONARIO DE CORRECCIONES ORTOGRÁFICAS
// =====================================================

/**
 * Diccionario de correcciones ortográficas comunes
 * Mapea palabras mal escritas a sus versiones correctas
 */
const SPELLING_CORRECTIONS: Record<string, string> = {
  // Construcción
  'contruir': 'construir',
  'contrucción': 'construcción',
  'material': 'material',
  'materiales': 'materiales',
  'prohibido': 'prohibido',
  'prohibidos': 'prohibidos',
  'permitido': 'permitido',
  'permitidos': 'permitidos',
  
  // Términos comunes mal escritos
  'fachada': 'fachada',
  'fachadas': 'fachadas',
  'techumbre': 'techumbre',
  'techumbres': 'techumbres',
  'canceleria': 'cancelaría',
  'canceleria': 'cancelaría',
  'acabado': 'acabado',
  'acabados': 'acabados',
  
  // Otros términos relacionados
  'norma': 'norma',
  'normas': 'normas',
  'reglamento': 'reglamento',
  'reglamentos': 'reglamentos',
  'manual': 'manual',
  'clúster': 'clúster',
  'cluster': 'clúster',
};

// =====================================================
// EXPANSIÓN SEMÁNTICA
// =====================================================

/**
 * Mapeo de términos a sus variantes semánticas
 * Ayuda a expandir queries para encontrar información relacionada
 */
const SEMANTIC_EXPANSIONS: Record<string, string[]> = {
  // Materiales prohibidos
  'material no puedo usar': [
    'materiales prohibidos',
    'materiales no permitidos',
    'materiales que no se pueden usar',
    'materiales que quedan prohibidos',
    'se prohíbe el uso de',
    'no se permite',
    'queda prohibido',
  ],
  'material prohibido': [
    'materiales prohibidos',
    'materiales no permitidos',
    'se prohíbe',
    'no se permite',
    'queda prohibido el uso',
  ],
  'material permitido': [
    'materiales permitidos',
    'materiales que se pueden usar',
    'materiales autorizados',
    'materiales aprobados',
  ],
  
  // Construcción
  'construir': [
    'construcción',
    'edificación',
    'obra',
    'desarrollo',
  ],
  'construcción': [
    'construir',
    'edificar',
    'obra',
    'desarrollo',
  ],
  
  // Fachadas
  'fachada': [
    'fachadas',
    'muros exteriores',
    'paredes exteriores',
    'acabados exteriores',
  ],
  
  // Techumbres
  'techumbre': [
    'techumbres',
    'cubiertas',
    'techos',
    'azoteas',
  ],
  
  // Pisos
  'piso': [
    'pisos',
    'suelos',
    'pavimentos',
  ],
  
  // Cancelaría
  'cancelaría': [
    'canceleria',
    'ventanas',
    'puertas',
    'vidrios',
  ],
  'canceleria': [
    'cancelaría',
    'ventanas',
    'puertas',
    'vidrios',
  ],
};

// =====================================================
// FUNCIONES DE PROCESAMIENTO
// =====================================================

/**
 * Corrige errores ortográficos comunes en el query
 * @param query - Query original del usuario
 * @returns Query con correcciones ortográficas aplicadas
 */
export function correctSpelling(query: string): string {
  let corrected = query;
  const words = query.toLowerCase().split(/\s+/);
  
  // Corregir palabras individuales
  const correctedWords = words.map(word => {
    // Limpiar puntuación para comparar
    const cleanWord = word.replace(/[.,!?;:()\[\]{}'"]/g, '');
    const correction = SPELLING_CORRECTIONS[cleanWord];
    
    if (correction) {
      // Mantener la capitalización original si era mayúscula
      if (word[0] === word[0].toUpperCase()) {
        return correction.charAt(0).toUpperCase() + correction.slice(1);
      }
      return correction;
    }
    return word;
  });
  
  corrected = correctedWords.join(' ');
  
  // Corregir frases completas (para casos como "contruir" en contexto)
  Object.entries(SPELLING_CORRECTIONS).forEach(([wrong, correct]) => {
    // Buscar la palabra mal escrita en el texto (case insensitive)
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    corrected = corrected.replace(regex, (match) => {
      // Mantener la capitalización original
      if (match[0] === match[0].toUpperCase()) {
        return correct.charAt(0).toUpperCase() + correct.slice(1);
      }
      return correct;
    });
  });
  
  return corrected;
}

/**
 * Expande semánticamente el query para mejorar la búsqueda
 * Agrega términos relacionados que pueden aparecer en los documentos
 * @param query - Query original (ya corregido ortográficamente)
 * @returns Array de queries expandidos (incluye el original)
 */
export function expandQuerySemantically(query: string): string[] {
  const queries: string[] = [query]; // Incluir el query original
  
  const lowerQuery = query.toLowerCase().trim();
  
  // Buscar expansiones exactas primero
  Object.entries(SEMANTIC_EXPANSIONS).forEach(([key, expansions]) => {
    if (lowerQuery.includes(key)) {
      // Agregar variantes semánticas
      expansions.forEach(expansion => {
        // Reemplazar la clave con la expansión
        const expanded = query.replace(new RegExp(key, 'gi'), expansion);
        if (expanded !== query && !queries.includes(expanded)) {
          queries.push(expanded);
        }
        
        // También agregar la expansión como query adicional
        if (!queries.includes(expansion)) {
          queries.push(expansion);
        }
      });
    }
  });
  
  // Expansiones específicas para preguntas sobre materiales prohibidos
  if (lowerQuery.includes('material') && (lowerQuery.includes('no puedo') || lowerQuery.includes('prohibido') || lowerQuery.includes('no permitido'))) {
    const materialExpansions = [
      'materiales prohibidos para construcción',
      'materiales no permitidos según el reglamento',
      'materiales prohibidos en fachadas techumbres pisos cancelaría',
      'se prohíbe el uso de materiales',
      'queda prohibido el uso de',
      'no se permite el uso de materiales',
    ];
    
    materialExpansions.forEach(expansion => {
      if (!queries.includes(expansion)) {
        queries.push(expansion);
      }
    });
  }
  
  // Expansiones para preguntas sobre construcción
  if (lowerQuery.includes('construir') || lowerQuery.includes('construcción')) {
    const constructionExpansions = [
      'normas de construcción',
      'reglamento de construcción',
      'manual de normas de diseño y construcción',
      'normas de diseño',
    ];
    
    constructionExpansions.forEach(expansion => {
      if (!queries.includes(expansion)) {
        queries.push(expansion);
      }
    });
  }
  
  return queries;
}

/**
 * Procesa un query completo: corrige ortografía y expande semánticamente
 * @param query - Query original del usuario
 * @returns Query procesado (corregido y expandido) - retorna el mejor query expandido
 */
export function processQuery(query: string): string {
  // Paso 1: Corregir ortografía
  const corrected = correctSpelling(query);
  
  // Paso 2: Expandir semánticamente
  const expanded = expandQuerySemantically(corrected);
  
  // Paso 3: Combinar el query original corregido con las expansiones más relevantes
  // Usar el query corregido como base y agregar términos clave de las expansiones
  let processed = corrected;
  
  // Si hay expansiones, combinar los términos más relevantes
  if (expanded.length > 1) {
    // Extraer términos clave de las expansiones y agregarlos al query
    const keyTerms = new Set<string>();
    
    expanded.forEach(expandedQuery => {
      // Extraer palabras importantes (sustantivos y verbos)
      const words = expandedQuery.toLowerCase().split(/\s+/);
      words.forEach(word => {
        // Filtrar palabras muy comunes
        const stopWords = ['el', 'la', 'los', 'las', 'de', 'del', 'en', 'con', 'para', 'por', 'que', 'se', 'no', 'un', 'una'];
        if (word.length > 3 && !stopWords.includes(word)) {
          keyTerms.add(word);
        }
      });
    });
    
    // Agregar términos clave al query si no están ya presentes
    const currentTerms = new Set(corrected.toLowerCase().split(/\s+/));
    const newTerms = Array.from(keyTerms).filter(term => !currentTerms.has(term));
    
    if (newTerms.length > 0) {
      // Agregar solo los 3-5 términos más relevantes para no diluir el query
      const relevantTerms = newTerms.slice(0, 5);
      processed = `${corrected} ${relevantTerms.join(' ')}`;
    }
  }
  
  return processed.trim();
}

/**
 * Genera múltiples variantes de un query para búsqueda mejorada
 * Útil cuando la búsqueda inicial no encuentra resultados
 * @param query - Query original
 * @returns Array de queries variantes para probar
 */
export function generateQueryVariants(query: string): string[] {
  const variants: string[] = [];
  const corrected = correctSpelling(query);
  const expanded = expandQuerySemantically(corrected);
  
  // Agregar todas las variantes
  variants.push(corrected); // Query corregido
  variants.push(...expanded); // Queries expandidos
  
  // Generar variantes adicionales basadas en patrones comunes
  const lowerQuery = corrected.toLowerCase();
  
  // Si pregunta sobre "no puedo usar", agregar variantes con "prohibido"
  if (lowerQuery.includes('no puedo usar') || lowerQuery.includes('no se puede usar')) {
    variants.push(lowerQuery.replace(/no puedo usar|no se puede usar/gi, 'prohibido'));
    variants.push(lowerQuery.replace(/no puedo usar|no se puede usar/gi, 'no permitido'));
    variants.push(lowerQuery.replace(/no puedo usar|no se puede usar/gi, 'se prohíbe'));
  }
  
  // Si pregunta sobre materiales, agregar contexto de construcción
  if (lowerQuery.includes('material') && !lowerQuery.includes('construcción') && !lowerQuery.includes('construir')) {
    variants.push(`${corrected} construcción`);
    variants.push(`${corrected} para construir`);
  }
  
  // Eliminar duplicados y retornar
  return Array.from(new Set(variants));
}

export default {
  correctSpelling,
  expandQuerySemantically,
  processQuery,
  generateQueryVariants,
};

