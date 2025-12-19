/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LEARNED RESPONSES WITH EMBEDDINGS
 * =====================================================
 * Sistema de búsqueda semántica para respuestas aprendidas
 * Usa embeddings para encontrar preguntas similares
 */

import { initPinecone, getPineconeIndex } from '@/lib/pinecone';
import { 
  getLearnedResponseById,
  getSimilarLearnedResponses,
  type LearnedResponseEntry 
} from '@/lib/postgres';
import { logger } from '@/lib/logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const LEARNED_RESPONSES_NAMESPACE = 'learned_responses'; // Namespace en Pinecone para respuestas aprendidas
const SIMILARITY_THRESHOLD = 0.80; // Umbral de similitud para considerar una pregunta similar (más bajo que caché porque queremos más matches)

// Caché en memoria para embeddings (evita regenerar embeddings para la misma query)
const embeddingCache = new Map<string, { vector: number[]; timestamp: number }>();
const EMBEDDING_CACHE_TTL = 60 * 60 * 1000; // 1 hora

// =====================================================
// FUNCIONES DE NORMALIZACIÓN
// =====================================================

/**
 * Normaliza un query para comparación
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

// =====================================================
// FUNCIONES DE BÚSQUEDA SEMÁNTICA
// =====================================================

/**
 * Busca una respuesta aprendida usando embeddings semánticos
 * Primero busca por coincidencia exacta, luego por similitud semántica
 * 
 * @param queryText - Texto de la consulta a buscar
 * @param minQualityScore - Score mínimo de calidad requerido (default: 0.7)
 * @returns Respuesta aprendida encontrada o null
 */
export async function findLearnedResponse(
  queryText: string,
  minQualityScore: number = 0.7
): Promise<{ entry: LearnedResponseEntry; similarity: number } | null> {
  const normalizedQuery = normalizeQuery(queryText);

  // 1. Generar o obtener embedding del query
  let queryVector: number[] | null = null;
  const embeddingCacheKey = normalizedQuery;
  const cachedEmbedding = embeddingCache.get(embeddingCacheKey);
  
  const now = Date.now();
  if (cachedEmbedding && (now - cachedEmbedding.timestamp) < EMBEDDING_CACHE_TTL) {
    // Usar embedding del caché en memoria
    queryVector = cachedEmbedding.vector;
    logger.info('Embedding desde caché en memoria (learned responses)', {}, 'learned-responses');
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
        logger.warn(
          'No se pudo generar embedding para búsqueda de respuestas aprendidas',
          {},
          'learned-responses'
        );
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
      logger.error('Error generando embedding para respuestas aprendidas', error, {}, 'learned-responses');
      return null;
    }
  }

  try {
    // 2. Buscar en Pinecone (namespace: learned_responses)
    const index = await getPineconeIndex();
    const ns = index.namespace(LEARNED_RESPONSES_NAMESPACE);

    const response = await ns.query({
      vector: queryVector,
      topK: 5, // Buscar top 5 para luego filtrar por quality_score
      includeMetadata: true,
    });

    // 3. Encontrar la mejor coincidencia que supere el umbral de similitud
    const validMatches = response.matches?.filter(
      match => match.score && match.score >= SIMILARITY_THRESHOLD
    ) || [];

    if (validMatches.length === 0) {
      logger.info(
        `No se encontraron respuestas aprendidas similares (umbral: ${SIMILARITY_THRESHOLD})`,
        {},
        'learned-responses'
      );
      return null;
    }

    // 4. Buscar las entradas en la base de datos y filtrar por quality_score
    const embeddingIds = validMatches.map(match => match.id);
    const similarEntries = await getSimilarLearnedResponses(embeddingIds);

    if (similarEntries.length === 0) {
      logger.info('No se encontraron respuestas aprendidas en la base de datos', {}, 'learned-responses');
      return null;
    }

    // 5. Combinar scores de similitud con las entradas de la BD
    const entriesWithSimilarity = similarEntries
      .map(entry => {
        const match = validMatches.find(m => m.id === entry.embedding_id);
        return {
          entry,
          similarity: match?.score || 0,
        };
      })
      .filter(({ entry, similarity }) => 
        entry.quality_score >= minQualityScore && similarity >= SIMILARITY_THRESHOLD
      )
      .sort((a, b) => {
        // Ordenar por: quality_score (peso 0.6) + similarity (peso 0.4)
        const scoreA = a.entry.quality_score * 0.6 + a.similarity * 0.4;
        const scoreB = b.entry.quality_score * 0.6 + b.similarity * 0.4;
        return scoreB - scoreA;
      });

    if (entriesWithSimilarity.length === 0) {
      logger.info(
        `No se encontraron respuestas aprendidas con quality_score >= ${minQualityScore}`,
        {},
        'learned-responses'
      );
      return null;
    }

    const bestMatch = entriesWithSimilarity[0];
    logger.info(
      `Respuesta aprendida encontrada (similarity: ${bestMatch.similarity.toFixed(2)}, quality_score: ${bestMatch.entry.quality_score.toFixed(2)})`,
      {},
      'learned-responses'
    );
    
    return bestMatch;
  } catch (error) {
    logger.error('Error buscando respuestas aprendidas', error, {}, 'learned-responses');
    return null;
  }
}

/**
 * Guarda o actualiza el embedding de una respuesta aprendida en Pinecone
 * 
 * @param embeddingId - ID único del embedding (formato: learned-{id})
 * @param queryText - Texto de la consulta
 * @returns true si se guardó correctamente
 */
export async function saveLearnedResponseEmbedding(
  embeddingId: string,
  queryText: string
): Promise<boolean> {
  try {
    const normalizedQuery = normalizeQuery(queryText);

    // Generar embedding
    const client = await initPinecone();
    const embeddings = await client.inference.embed(
      'llama-text-embed-v2',
      [normalizedQuery],
      { inputType: 'query' }
    );

    if (!embeddings[0]?.values || embeddings[0].values.length === 0) {
      logger.warn('No se pudo generar embedding para guardar respuesta aprendida', {}, 'learned-responses');
      return false;
    }

    const queryVector = embeddings[0].values;

    // Guardar en Pinecone
    const index = await getPineconeIndex();
    const ns = index.namespace(LEARNED_RESPONSES_NAMESPACE);

    await ns.upsert([
      {
        id: embeddingId,
        values: queryVector,
        metadata: {
          query_text: normalizedQuery,
        },
      },
    ]);

    logger.info(`Embedding guardado en Pinecone: ${embeddingId}`, {}, 'learned-responses');
    return true;
  } catch (error) {
    logger.error('Error guardando embedding de respuesta aprendida', error, {}, 'learned-responses');
    return false;
  }
}

/**
 * Elimina un embedding de respuesta aprendida de Pinecone
 * Verifica que la respuesta aprendida existe antes de eliminar
 * 
 * @param embeddingId - ID del embedding a eliminar (formato: learned-{id})
 */
export async function deleteLearnedResponseEmbedding(embeddingId: string): Promise<void> {
  try {
    // Extraer el ID numérico del embedding_id (formato: "learned-{id}")
    const idMatch = embeddingId.match(/^learned-(\d+)$/);
    if (!idMatch) {
      logger.warn(`Formato de embedding_id inválido: ${embeddingId}`, {}, 'learned-responses');
      return;
    }

    const responseId = parseInt(idMatch[1], 10);
    
    // Verificar que la respuesta aprendida existe en la BD
    const learnedResponse = await getLearnedResponseById(responseId);
    if (!learnedResponse) {
      logger.warn(
        `Respuesta aprendida con ID ${responseId} no existe, no se puede eliminar embedding`,
        {},
        'learned-responses'
      );
      return;
    }

    // Verificar que el embedding_id coincide
    if (learnedResponse.embedding_id !== embeddingId) {
      logger.warn(
        `El embedding_id no coincide: esperado ${embeddingId}, encontrado ${learnedResponse.embedding_id}`,
        {},
        'learned-responses'
      );
      return;
    }

    // Eliminar de Pinecone
    const index = await getPineconeIndex();
    const ns = index.namespace(LEARNED_RESPONSES_NAMESPACE);
    
    await ns.deleteOne(embeddingId);
    logger.info(`Embedding eliminado de Pinecone: ${embeddingId}`, {}, 'learned-responses');
  } catch (error) {
    logger.error('Error eliminando embedding de respuesta aprendida', error, {}, 'learned-responses');
    // No lanzar error, es opcional
  }
}

