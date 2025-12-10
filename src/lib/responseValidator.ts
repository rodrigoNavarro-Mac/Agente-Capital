/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - RESPONSE VALIDATOR
 * =====================================================
 * Valida que las respuestas del agente estén 100% apegadas
 * a la información contenida en los chunks recuperados.
 * 
 * Esta función:
 * 1. Extrae las citas de la respuesta ([1], [2], etc.)
 * 2. Verifica que cada cita corresponda a un chunk válido
 * 3. Identifica afirmaciones sin citas
 * 4. Filtra o marca información no respaldada
 */

import type { PineconeMatch } from '@/types/documents';

/**
 * Resultado de la validación de una respuesta
 */
export interface ValidationResult {
  isValid: boolean;
  filteredResponse: string;
  warnings: string[];
  citationsFound: number[];
  uncitedClaims: string[];
}

/**
 * Valida que una respuesta esté apegada a los chunks proporcionados
 * 
 * @param response - Respuesta del LLM
 * @param matches - Chunks recuperados de Pinecone
 * @returns Resultado de la validación con la respuesta filtrada
 */
export function validateResponseAgainstChunks(
  response: string,
  matches: PineconeMatch[]
): ValidationResult {
  const warnings: string[] = [];
  const uncitedClaims: string[] = [];
  
  // Si no hay chunks, no podemos validar
  if (!matches || matches.length === 0) {
    return {
      isValid: false,
      filteredResponse: response,
      warnings: ['No hay chunks disponibles para validar la respuesta'],
      citationsFound: [],
      uncitedClaims: [],
    };
  }

  // Extraer todas las citas de la respuesta (formato [1], [2], [1][2], etc.)
  const citationRegex = /\[(\d+)\]/g;
  const citationsFound: number[] = [];
  let match;
  
  while ((match = citationRegex.exec(response)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    if (!citationsFound.includes(citationNumber)) {
      citationsFound.push(citationNumber);
    }
  }

  // Verificar que todas las citas sean válidas (deben estar entre 1 y matches.length)
  const validCitations = citationsFound.filter(citation => 
    citation >= 1 && citation <= matches.length
  );
  
  const invalidCitations = citationsFound.filter(citation => 
    citation < 1 || citation > matches.length
  );

  if (invalidCitations.length > 0) {
    warnings.push(
      `Se encontraron citas inválidas: [${invalidCitations.join('], [')}]. ` +
      `Solo hay ${matches.length} fuentes disponibles.`
    );
  }

  // Dividir la respuesta en oraciones para identificar afirmaciones sin citas
  // Usar un regex más robusto que maneje diferentes tipos de puntuación
  const sentences = response
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);

  // Identificar oraciones sin citas que parezcan afirmaciones (no preguntas ni saludos)
  const questionWords = ['qué', 'cuál', 'cuáles', 'cómo', 'cuándo', 'dónde', 'por qué', 'quién', 'quiénes'];
  const greetingWords = ['hola', 'buenos días', 'buenas tardes', 'gracias', 'saludos'];
  
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase().trim();
    
    // Saltar si es una pregunta
    const isQuestion = questionWords.some(word => lowerSentence.startsWith(word)) ||
                       lowerSentence.includes('?');
    
    // Saltar si es un saludo
    const isGreeting = greetingWords.some(word => lowerSentence.includes(word));
    
    // Saltar si tiene una cita
    const hasCitation = /\[\d+\]/.test(sentence);
    
    // Saltar si es muy corta (probablemente no es una afirmación)
    const isTooShort = sentence.trim().length < 20;
    
    // Saltar si contiene frases comunes que no son afirmaciones
    const isCommonPhrase = /^(por favor|te sugiero|puedo ayudarte|si necesitas)/i.test(sentence);
    
    if (!isQuestion && !isGreeting && !hasCitation && !isTooShort && !isCommonPhrase) {
      // Verificar si la oración contiene información específica (números, nombres propios, etc.)
      const hasSpecificInfo = /\d+/.test(sentence) || 
                              /[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/.test(sentence) ||
                              /(precio|mxn|pesos|metros|m²|departamento|lote|unidad|amenidad)/i.test(sentence);
      
      if (hasSpecificInfo) {
        uncitedClaims.push(sentence.trim());
      }
    }
  }

  // Si hay afirmaciones sin citas, agregar advertencias
  if (uncitedClaims.length > 0) {
    warnings.push(
      `Se encontraron ${uncitedClaims.length} afirmación(es) con información específica sin citas. ` +
      `Estas afirmaciones pueden no estar respaldadas por los chunks proporcionados.`
    );
  }

  // Construir la respuesta filtrada
  let filteredResponse = response;

  // Si hay citas inválidas, removerlas
  if (invalidCitations.length > 0) {
    for (const invalidCitation of invalidCitations) {
      filteredResponse = filteredResponse.replace(
        new RegExp(`\\[${invalidCitation}\\]`, 'g'),
        ''
      );
    }
  }

  // Si hay muchas afirmaciones sin citas, agregar una nota al final
  if (uncitedClaims.length > 2) {
    filteredResponse += '\n\n> **Nota**: Algunas afirmaciones en esta respuesta pueden no estar completamente respaldadas por las fuentes proporcionadas. Por favor, verifica la información crítica con los documentos originales.';
  }

  // Determinar si la respuesta es válida
  // Consideramos válida si:
  // 1. Tiene al menos una cita válida, O
  // 2. No tiene afirmaciones sin citas con información específica
  const isValid = validCitations.length > 0 || uncitedClaims.length === 0;

  return {
    isValid,
    filteredResponse: filteredResponse.trim(),
    warnings,
    citationsFound: validCitations,
    uncitedClaims,
  };
}

/**
 * Extrae el texto de todos los chunks para búsqueda de contenido
 * 
 * @param matches - Chunks recuperados
 * @returns Texto concatenado de todos los chunks
 */
export function extractChunksText(matches: PineconeMatch[]): string {
  return matches
    .map(match => match.metadata.text || '')
    .join(' ')
    .toLowerCase();
}

/**
 * Verifica si una afirmación específica está respaldada por los chunks
 * 
 * @param claim - Afirmación a verificar
 * @param chunksText - Texto de todos los chunks concatenados
 * @returns true si la afirmación parece estar respaldada
 */
export function isClaimSupported(claim: string, chunksText: string): boolean {
  // Normalizar ambos textos
  const normalizedClaim = claim.toLowerCase().trim();
  const normalizedChunks = chunksText.toLowerCase();

  // Extraer palabras clave importantes (números, nombres propios, términos técnicos)
  const claimWords = normalizedClaim
    .split(/\s+/)
    .filter(word => {
      // Filtrar palabras comunes
      const commonWords = ['el', 'la', 'los', 'las', 'de', 'del', 'en', 'y', 'o', 'a', 'un', 'una', 'es', 'son', 'está', 'están', 'para', 'con', 'por', 'que', 'qué'];
      return !commonWords.includes(word) && word.length > 2;
    });

  // Verificar si al menos el 50% de las palabras clave están en los chunks
  if (claimWords.length === 0) {
    return true; // Si no hay palabras clave, asumimos que es válida
  }

  const matchingWords = claimWords.filter(word => normalizedChunks.includes(word));
  const matchRatio = matchingWords.length / claimWords.length;

  return matchRatio >= 0.5; // Al menos 50% de las palabras deben estar en los chunks
}

/**
 * Valida y filtra una respuesta de manera más estricta
 * Elimina afirmaciones que no están respaldadas por los chunks
 * 
 * @param response - Respuesta del LLM
 * @param matches - Chunks recuperados
 * @returns Respuesta filtrada con solo información respaldada
 */
export function strictValidateResponse(
  response: string,
  matches: PineconeMatch[]
): ValidationResult {
  const basicValidation = validateResponseAgainstChunks(response, matches);
  
  if (basicValidation.uncitedClaims.length === 0) {
    return basicValidation;
  }

  // Extraer texto de chunks
  const chunksText = extractChunksText(matches);
  
  // Filtrar oraciones sin citas que no estén respaldadas
  const sentences = response.split(/(?<=[.!?])\s+/);
  const filteredSentences: string[] = [];
  
  for (const sentence of sentences) {
    const hasCitation = /\[\d+\]/.test(sentence);
    
    if (hasCitation) {
      // Si tiene cita, incluirla
      filteredSentences.push(sentence);
    } else {
      // Si no tiene cita, verificar si está respaldada
      if (isClaimSupported(sentence, chunksText)) {
        filteredSentences.push(sentence);
      } else {
        // Marcar como removida en los warnings
        basicValidation.warnings.push(
          `Se removió la siguiente afirmación no respaldada: "${sentence.substring(0, 50)}..."`
        );
      }
    }
  }

  return {
    ...basicValidation,
    filteredResponse: filteredSentences.join(' ').trim(),
    isValid: basicValidation.citationsFound.length > 0,
  };
}

export default {
  validateResponseAgainstChunks,
  strictValidateResponse,
  extractChunksText,
  isClaimSupported,
};

