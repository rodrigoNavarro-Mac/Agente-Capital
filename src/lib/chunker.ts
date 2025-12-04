/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - TEXT CHUNKER
 * =====================================================
 * Módulo para dividir textos largos en chunks manejables
 * para procesamiento con embeddings y LLM.
 */

import { v4 as uuidv4 } from 'uuid';
import type { TextChunk, ChunkMetadata, Zone, DocumentContentType } from '@/types/documents';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const DEFAULT_CHUNK_SIZE = 500;      // Tokens aproximados por chunk
const DEFAULT_CHUNK_OVERLAP = 50;    // Tokens de solapamiento entre chunks
const CHARS_PER_TOKEN = 4;           // Aproximación de caracteres por token

// =====================================================
// FUNCIONES PRINCIPALES
// =====================================================

/**
 * Divide un texto en chunks de tamaño manejable
 * 
 * @param text - Texto a dividir
 * @param maxTokens - Número máximo de tokens por chunk (default: 500)
 * @param overlap - Tokens de solapamiento entre chunks (default: 50)
 * @returns Array de strings con los chunks de texto
 */
export function chunkText(
  text: string,
  maxTokens: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Convertir tokens a caracteres aproximados
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;

  // Primero, dividir por párrafos
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // Si el párrafo cabe en el chunk actual
    if ((currentChunk + '\n\n' + paragraph).length <= maxChars) {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
    } else {
      // Si el chunk actual no está vacío, guardarlo
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        
        // Mantener overlap: tomar el final del chunk anterior
        const overlapText = currentChunk.slice(-overlapChars);
        currentChunk = overlapText + '\n\n' + paragraph;
      } else {
        // Si el párrafo es muy largo, dividirlo por oraciones
        const sentenceChunks = chunkBySentences(paragraph, maxChars, overlapChars);
        chunks.push(...sentenceChunks);
        currentChunk = '';
      }
      
      // Si el nuevo chunk ya es demasiado grande, procesarlo
      if (currentChunk.length > maxChars) {
        const sentenceChunks = chunkBySentences(currentChunk, maxChars, overlapChars);
        chunks.push(...sentenceChunks.slice(0, -1)); // Todos menos el último
        currentChunk = sentenceChunks[sentenceChunks.length - 1] || '';
      }
    }
  }

  // Agregar el último chunk si no está vacío
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Divide un texto por oraciones
 * Usado cuando un párrafo es demasiado largo
 */
function chunkBySentences(
  text: string,
  maxChars: number,
  overlapChars: number
): string[] {
  // Dividir por oraciones (puntos, signos de interrogación, exclamación)
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).length <= maxChars) {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        
        // Overlap
        const overlapText = currentChunk.slice(-overlapChars);
        currentChunk = overlapText + ' ' + sentence;
      } else {
        // Si una sola oración es muy larga, dividirla por palabras
        const wordChunks = chunkByWords(sentence, maxChars, overlapChars);
        chunks.push(...wordChunks);
        currentChunk = '';
      }
      
      // Verificar si el nuevo chunk es demasiado grande
      if (currentChunk.length > maxChars) {
        const wordChunks = chunkByWords(currentChunk, maxChars, overlapChars);
        chunks.push(...wordChunks.slice(0, -1));
        currentChunk = wordChunks[wordChunks.length - 1] || '';
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Divide un texto por palabras
 * Usado cuando una oración es demasiado larga
 */
function chunkByWords(
  text: string,
  maxChars: number,
  overlapChars: number
): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  const chunks: string[] = [];
  let currentChunk = '';

  for (const word of words) {
    if ((currentChunk + ' ' + word).length <= maxChars) {
      currentChunk = currentChunk ? currentChunk + ' ' + word : word;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        
        // Overlap simple para palabras
        const lastWords = currentChunk.split(/\s+/).slice(-5).join(' ');
        currentChunk = lastWords + ' ' + word;
        
        // Limitar el overlap
        if (currentChunk.length > maxChars) {
          currentChunk = word;
        }
      } else {
        // Si una palabra es más larga que maxChars (muy raro), forzar división
        chunks.push(word.slice(0, maxChars));
        currentChunk = word.slice(maxChars - overlapChars);
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Crea chunks con metadatos completos para Pinecone
 * 
 * @param text - Texto completo del documento
 * @param metadata - Metadatos base del documento
 * @param options - Opciones de chunking
 * @returns Array de TextChunk listos para Pinecone
 */
export function createChunksWithMetadata(
  text: string,
  metadata: {
    zone: Zone;
    development: string;
    type: DocumentContentType;
    sourceFileName: string;
    uploaded_by: number;
    page?: number;
  },
  options: {
    maxTokens?: number;
    overlap?: number;
  } = {}
): TextChunk[] {
  const { maxTokens = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = options;
  
  // Dividir el texto en chunks
  const textChunks = chunkText(text, maxTokens, overlap);
  
  // Crear chunks con metadatos
  const chunks: TextChunk[] = textChunks.map((chunkText, index) => {
    const chunkMetadata: ChunkMetadata = {
      zone: metadata.zone,
      development: metadata.development,
      type: metadata.type,
      page: metadata.page || 1,
      chunk: index + 1,
      sourceFileName: metadata.sourceFileName,
      uploaded_by: metadata.uploaded_by,
      created_at: new Date().toISOString(),
    };

    return {
      id: generateChunkId(metadata.sourceFileName, index),
      text: chunkText,
      metadata: chunkMetadata,
    };
  });

  return chunks;
}

/**
 * Genera un ID único para un chunk
 */
function generateChunkId(filename: string, chunkIndex: number): string {
  // Limpiar el nombre del archivo
  const cleanFilename = filename
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase()
    .slice(0, 50);
  
  // Generar UUID corto
  const shortUuid = uuidv4().split('-')[0];
  
  return `${cleanFilename}_chunk${chunkIndex}_${shortUuid}`;
}

/**
 * Estima el número de tokens en un texto
 * @param text - Texto a estimar
 * @returns Número estimado de tokens
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Aproximación: ~4 caracteres por token en español/inglés
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Divide un texto por páginas (útil para PDFs)
 * @param text - Texto con separadores de página
 * @param pageMarker - Marcador que indica nueva página (default: '\f' form feed)
 * @returns Array de textos, uno por página
 */
export function splitByPages(text: string, pageMarker: string = '\f'): string[] {
  return text.split(pageMarker).filter(page => page.trim().length > 0);
}

/**
 * Crea chunks preservando información de página
 * Útil para documentos PDF con múltiples páginas
 */
export function createPageAwareChunks(
  pages: string[],
  metadata: {
    zone: Zone;
    development: string;
    type: DocumentContentType;
    sourceFileName: string;
    uploaded_by: number;
  },
  options: {
    maxTokens?: number;
    overlap?: number;
  } = {}
): TextChunk[] {
  const allChunks: TextChunk[] = [];
  
  pages.forEach((pageText, pageIndex) => {
    const pageChunks = createChunksWithMetadata(
      pageText,
      {
        ...metadata,
        page: pageIndex + 1,
      },
      options
    );
    
    allChunks.push(...pageChunks);
  });
  
  return allChunks;
}

// =====================================================
// FUNCIONES DE VALIDACIÓN
// =====================================================

/**
 * Valida que los chunks tengan un tamaño apropiado
 */
export function validateChunks(chunks: TextChunk[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  chunks.forEach((chunk, index) => {
    const tokens = estimateTokens(chunk.text);
    
    if (tokens < 10) {
      issues.push(`Chunk ${index + 1} muy corto (${tokens} tokens)`);
    }
    
    if (tokens > 1000) {
      issues.push(`Chunk ${index + 1} muy largo (${tokens} tokens)`);
    }
    
    if (!chunk.text.trim()) {
      issues.push(`Chunk ${index + 1} está vacío`);
    }
  });
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Resumen de chunks para logging
 */
export function summarizeChunks(chunks: TextChunk[]): {
  totalChunks: number;
  avgTokens: number;
  minTokens: number;
  maxTokens: number;
  totalTokens: number;
} {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      avgTokens: 0,
      minTokens: 0,
      maxTokens: 0,
      totalTokens: 0,
    };
  }
  
  const tokenCounts = chunks.map(c => estimateTokens(c.text));
  const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
  
  return {
    totalChunks: chunks.length,
    avgTokens: Math.round(totalTokens / chunks.length),
    minTokens: Math.min(...tokenCounts),
    maxTokens: Math.max(...tokenCounts),
    totalTokens,
  };
}

export default {
  chunkText,
  createChunksWithMetadata,
  createPageAwareChunks,
  estimateTokens,
  splitByPages,
  validateChunks,
  summarizeChunks,
};

