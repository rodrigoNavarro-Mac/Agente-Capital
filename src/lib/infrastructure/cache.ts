/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - QUERY CACHE
 * =====================================================
 * Sistema de caché para respuestas de consultas
 * Usa embeddings para encontrar preguntas similares
 */

import { createHash } from 'crypto';
import { initPinecone, getPineconeIndex } from '@/lib/db/pinecone';
import { logger } from '@/lib/utils/logger';
import { 
  getCachedResponse, 
  saveCachedResponse, 
  incrementCacheHit,
  getSimilarCachedResponses,
  cleanupExpiredCache,
  hasBadFeedbackInCache,
  type QueryCacheEntry 
} from '@/lib/db/postgres';
import type { Zone, DocumentContentType, SourceReference } from '@/types/documents';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const CACHE_NAMESPACE = 'cache'; // Namespace en Pinecone para el caché
const SIMILARITY_THRESHOLD = 0.85; // Umbral de similitud para considerar una pregunta similar
const CACHE_EXPIRY_DAYS = 30; // Días antes de que expire el caché (opcional)

// Caché en memoria para embeddings (evita regenerar embeddings para la misma query)
const embeddingCache = new Map<string, { vector: number[]; timestamp: number }>();
const EMBEDDING_CACHE_TTL = 60 * 60 * 1000; // 1 hora

// =====================================================
// FUNCIONES DE HASH
// =====================================================

/**
 * Genera un hash MD5 de un query normalizado
 * @param query - Texto de la consulta
 * @returns Hash MD5 del query normalizado
 */
export function generateQueryHash(query: string): string {
  // Normalizar: lowercase, eliminar espacios extra, trim
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('md5').update(normalized).digest('hex');
}

/**
 * Normaliza un query para comparación
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

// =====================================================
// FUNCIONES DE CACHÉ
// =====================================================

/**
 * Busca una respuesta en el caché
 * Primero busca por hash exacto, luego por similitud semántica
 */
export async function findCachedResponse(
  query: string,
  zone: Zone,
  development: string,
  documentType?: DocumentContentType
): Promise<{ entry: QueryCacheEntry; similarity: number } | null> {
  const queryHash = generateQueryHash(query);
  const normalizedQuery = normalizeQuery(query);

  // 1. Buscar por hash exacto (más rápido)
  const exactMatch = await getCachedResponse(
    queryHash,
    zone,
    development,
    documentType
  );

  if (exactMatch) {
    // Verificar si esta respuesta tiene feedback negativo asociado
    const hasBadFeedback = await hasBadFeedbackInCache(query, zone, development);
    if (hasBadFeedback) {
      logger.warn(`Caché ignorado (tiene feedback negativo): "${query.substring(0, 50)}..."`, {}, 'cache');
      return null;
    }
    
    logger.info(`Caché HIT (exacto): "${query.substring(0, 50)}..."`, {}, 'cache');
    await incrementCacheHit(exactMatch.id);
    return { entry: exactMatch, similarity: 1.0 };
  }

  // 2. Buscar por similitud semántica usando Pinecone
  // Primero intentar obtener el embedding del caché en memoria
  let queryVector: number[] | null = null;
  const embeddingCacheKey = `${normalizedQuery}:${zone}:${development}`;
  const cachedEmbedding = embeddingCache.get(embeddingCacheKey);
  
  const now = Date.now();
  if (cachedEmbedding && (now - cachedEmbedding.timestamp) < EMBEDDING_CACHE_TTL) {
    // Usar embedding del caché en memoria
    queryVector = cachedEmbedding.vector;
    logger.info('Embedding desde caché en memoria', {}, 'cache');
  } else {
    // Generar nuevo embedding
    try {
      const client = await initPinecone();
      
      const embeddings = await client.inference.embed(
        'llama-text-embed-v2',
        [normalizedQuery],
        { inputType: 'query' }
      );

      if (!embeddings[0]?.values || embeddings[0].values.length === 0) {
        logger.warn('No se pudo generar embedding para búsqueda en caché', {}, 'cache');
        return null;
      }

      queryVector = embeddings[0].values;
      
      // Guardar en caché en memoria
      embeddingCache.set(embeddingCacheKey, {
        vector: queryVector,
        timestamp: now,
      });
      
      // Limpiar entradas antiguas del caché de embeddings (mantener solo las últimas 100)
      if (embeddingCache.size > 100) {
        const entries = Array.from(embeddingCache.entries());
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        const toKeep = entries.slice(0, 100);
        embeddingCache.clear();
        toKeep.forEach(([key, value]) => embeddingCache.set(key, value));
      }
  } catch (error) {
    logger.error('Error generando embedding', error, {}, 'cache');
    return null;
  }
  }

  try {

    // Buscar en Pinecone (namespace: cache)
    // Reducir topK a 3 para consultas más rápidas (solo necesitamos la mejor coincidencia)
    const index = await getPineconeIndex();
    const ns = index.namespace(CACHE_NAMESPACE);

    const response = await ns.query({
      vector: queryVector,
      topK: 3, // Reducido de 5 a 3 para consultas más rápidas
      filter: {
        zone: { $eq: zone },
        development: { $eq: development },
        ...(documentType && { document_type: { $eq: documentType } }),
      },
      includeMetadata: true,
    });

    // Encontrar la mejor coincidencia que supere el umbral
    // Optimización: usar el primer match que supere el umbral (ya están ordenados por score)
    const bestMatch = response.matches?.find(match => match.score && match.score >= SIMILARITY_THRESHOLD);
    
    if (bestMatch && bestMatch.id && bestMatch.score !== undefined) {
      const embeddingId = bestMatch.id;
      const similarityScore = bestMatch.score;
      
      // Buscar la entrada en la base de datos
      const similarEntries = await getSimilarCachedResponses(
        [embeddingId],
        zone,
        development,
        1
      );

      if (similarEntries.length > 0) {
        const entry = similarEntries[0];
        
        // Verificar si esta respuesta tiene feedback negativo asociado
        const hasBadFeedback = await hasBadFeedbackInCache(query, zone, development);
        if (hasBadFeedback) {
          logger.warn(
            `Caché ignorado (tiene feedback negativo): "${query.substring(0, 50)}..."`,
            {},
            'cache'
          );
          return null;
        }
        
        logger.info(
          `Caché HIT (similar, score: ${similarityScore.toFixed(2)}): "${query.substring(0, 50)}..."`,
          {},
          'cache'
        );
        await incrementCacheHit(entry.id);
        return { entry, similarity: similarityScore };
      }
    }

    logger.info(`Caché MISS: "${query.substring(0, 50)}..."`, {}, 'cache');
    return null;
  } catch (error) {
    logger.error('Error buscando en caché', error, {}, 'cache');
    return null;
  }
}

/**
 * Guarda una respuesta en el caché
 * NO guarda si la respuesta tiene feedback negativo asociado
 */
export async function saveToCache(
  query: string,
  zone: Zone,
  development: string,
  response: string,
  sources: SourceReference[],
  documentType?: DocumentContentType
): Promise<void> {
  try {
    // Verificar si esta respuesta tiene feedback negativo asociado
    // Si tiene, no guardar en caché
    const hasBadFeedback = await hasBadFeedbackInCache(query, zone, development);
    if (hasBadFeedback) {
      logger.warn(
        `No se guarda en caché (tiene feedback negativo): "${query.substring(0, 50)}..."`,
        {},
        'cache'
      );
      return;
    }
    const queryHash = generateQueryHash(query);
    const normalizedQuery = normalizeQuery(query);

    // Generar embedding para búsqueda semántica
    let embeddingId: string | undefined;
    try {
      const client = await initPinecone();
      const embeddings = await client.inference.embed(
        'llama-text-embed-v2',
        [normalizedQuery],
        { inputType: 'query' }
      );

      if (embeddings[0]?.values && embeddings[0].values.length > 0) {
        const queryVector = embeddings[0].values;
        embeddingId = `cache-${queryHash}`;

        // Guardar en Pinecone
        const index = await getPineconeIndex();
        const ns = index.namespace(CACHE_NAMESPACE);

        await ns.upsert([
          {
            id: embeddingId,
            values: queryVector,
            metadata: {
              query_text: normalizedQuery,
              zone,
              development,
              ...(documentType && { document_type: documentType }),
              query_hash: queryHash,
            },
          },
        ]);

        logger.info(`Embedding guardado en caché: ${embeddingId}`, {}, 'cache');
      }
    } catch (error) {
      logger.error('Error guardando embedding en caché', error, {}, 'cache');
      // Continuar sin embedding (solo hash exacto funcionará)
    }

    // Calcular fecha de expiración (opcional)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_EXPIRY_DAYS);

    // Guardar en base de datos
    // IMPORTANTE: Guardar los nombres de archivos de las fuentes
    const sourceFilenames = sources && sources.length > 0 
      ? sources.map(s => s.filename)
      : [];
    
    await saveCachedResponse({
      query_text: normalizedQuery,
      query_hash: queryHash,
      zone,
      development,
      document_type: documentType,
      response,
      sources_used: sourceFilenames,
      embedding_id: embeddingId,
      expires_at: expiresAt,
    });

    logger.info(
      `Respuesta guardada en caché: ${queryHash} con ${sourceFilenames.length} fuentes`,
      {},
      'cache'
    );
  } catch (error) {
    logger.error('Error guardando en caché', error, {}, 'cache');
    // No lanzar error, el caché es opcional
  }
}

/**
 * Limpia el caché expirado
 */
export async function cleanupCache(): Promise<number> {
  try {
    const deletedCount = await cleanupExpiredCache();
    logger.info(`Caché limpiado: ${deletedCount} entradas eliminadas`, {}, 'cache');
    return deletedCount;
  } catch (error) {
    logger.error('Error limpiando caché', error, {}, 'cache');
    return 0;
  }
}




