/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - PINECONE CLIENT
 * =====================================================
 * Módulo para interactuar con Pinecone para almacenamiento
 * y búsqueda de embeddings de documentos.
 * 
 * Configuración:
 * - SDK: @pinecone-database/pinecone v3.0.0
 * - Modelo: llama-text-embed-v2 (dimensión 1024)
 * - Método: Pinecone Inference API para generar embeddings
 * 
 * Flujo:
 * 1. client.inference.embed() genera embeddings desde texto
 * 2. index.namespace().upsert() inserta vectores con metadata
 * 3. index.namespace().query() busca vectores similares
 */

import { Pinecone, Index, RecordMetadata } from '@pinecone-database/pinecone';
import type { 
  TextChunk, 
  ChunkMetadata, 
  PineconeFilter, 
  PineconeMatch 
} from '@/types/documents';
import { getMultipleChunkStats } from './postgres';
import { processQuery, generateQueryVariants } from './queryProcessing';
// Pinecone Inference lo hace automáticamente

// =====================================================
// CONFIGURACIÓN
// =====================================================

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'capitalplus-rag';

// Singleton del cliente Pinecone
let pineconeClient: Pinecone | null = null;
let pineconeIndex: Index<RecordMetadata> | null = null;

// =====================================================
// INICIALIZACIÓN
// =====================================================

/**
 * Inicializa el cliente de Pinecone
 * @returns Cliente de Pinecone configurado
 */
export async function initPinecone(): Promise<Pinecone> {
  if (pineconeClient) {
    return pineconeClient;
  }

  if (!PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY no está configurado en las variables de entorno');
  }

  pineconeClient = new Pinecone({
    apiKey: PINECONE_API_KEY,
  });

  console.log('✅ Cliente Pinecone inicializado');
  return pineconeClient;
}

/**
 * Obtiene el índice de Pinecone
 * @returns Índice de Pinecone configurado
 */
export async function getPineconeIndex(): Promise<Index<RecordMetadata>> {
  if (pineconeIndex) {
    return pineconeIndex;
  }

  const client = await initPinecone();
  pineconeIndex = client.index(PINECONE_INDEX_NAME);
  
  console.log(`✅ Índice Pinecone "${PINECONE_INDEX_NAME}" conectado`);
  return pineconeIndex;
}

// =====================================================
// UPSERT FUNCTIONS
// =====================================================

/**
 * Inserta o actualiza chunks en Pinecone usando Pinecone Inference API
 * 
 * Proceso en 3 pasos:
 * 1. Llama a client.inference.embed() para generar embeddings con llama-text-embed-v2
 * 2. Crea records con los vectores generados y metadata
 * 3. Hace upsert de los records al índice
 * 
 * @param namespace - Namespace para organizar vectores (zona)
 * @param chunks - Array de chunks de texto con metadatos
 * @returns Número de chunks insertados
 */

export async function upsertChunks(
  namespace: string,
  chunks: TextChunk[]
): Promise<number> {
  try {
    if (!chunks || chunks.length === 0) {
      return 0;
    }

    console.log(`📦 Preparando ${chunks.length} chunks para Pinecone...`);
    
    // ========================================
    // PASO 1: Generar embeddings con Pinecone Inference API
    // ========================================
    const client = await initPinecone();
    const texts = chunks.map(chunk => chunk.text);
    
    console.log(`🧠 Generando embeddings con llama-text-embed-v2...`);
    
    // La API de Inference tiene un límite de ~96 textos por llamada
    // Generamos embeddings en batches si es necesario
    const INFERENCE_BATCH_SIZE = 96;
    const allEmbeddings: Array<{ values: number[] }> = [];
    
    for (let i = 0; i < texts.length; i += INFERENCE_BATCH_SIZE) {
      const textBatch = texts.slice(i, i + INFERENCE_BATCH_SIZE);
      console.log(`   Generando embeddings para batch ${Math.floor(i / INFERENCE_BATCH_SIZE) + 1}/${Math.ceil(texts.length / INFERENCE_BATCH_SIZE)} (${textBatch.length} textos)...`);
      
      const embeddings = await client.inference.embed(
        'llama-text-embed-v2',     // Modelo configurado en tu índice
        textBatch,                  // Array de textos a convertir
        { inputType: 'passage' }    // 'passage' para documentos, 'query' para búsquedas
      );
      
      // Validar que los embeddings tienen valores
      for (const embedding of embeddings) {
        if (!embedding.values || embedding.values.length === 0) {
          throw new Error('❌ Pinecone Inference no generó valores para uno de los embeddings');
        }
        allEmbeddings.push({ values: embedding.values });
      }
    }
    
    console.log(`✅ Embeddings generados: ${allEmbeddings.length} vectores de dimensión 1024`);
    
    // ========================================
    // PASO 2: Crear records con los embeddings generados
    // ========================================
    const index = await getPineconeIndex();
    const ns = index.namespace(namespace);
    
    const records = chunks.map((chunk, idx) => ({
      id: chunk.id,
      values: allEmbeddings[idx].values,  // ✅ Vector generado por Pinecone Inference
      metadata: {
        text: chunk.text,  // Guardamos el texto original en metadata
        zone: chunk.metadata.zone,
        development: chunk.metadata.development,
        type: chunk.metadata.type,
        page: chunk.metadata.page,
        chunk: chunk.metadata.chunk,
        sourceFileName: chunk.metadata.sourceFileName,
        uploaded_by: chunk.metadata.uploaded_by,
        created_at: chunk.metadata.created_at,
      },
    }));

    // ========================================
    // PASO 3: Subir a Pinecone en batches
    // ========================================
    const UPSERT_BATCH_SIZE = 100;
    let totalUpserted = 0;

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const batch = records.slice(i, i + UPSERT_BATCH_SIZE);
      await ns.upsert(batch);
      totalUpserted += batch.length;
      console.log(`📤 Upserted batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}: ${batch.length} chunks`);
    }

    console.log(`✅ Total chunks insertados en namespace "${namespace}": ${totalUpserted}`);
    return totalUpserted;
  } catch (error) {
    console.error('❌ Error en upsertChunks:', error);
    throw error;
  }
}

/**
 * Versión alternativa de upsert usando la API estándar
 * Útil si los embeddings integrados no están disponibles
 */
export async function upsertChunksWithVectors(
  namespace: string,
  chunks: Array<{ id: string; values: number[]; metadata: ChunkMetadata }>
): Promise<number> {
  try {
    const index = await getPineconeIndex();
    const ns = index.namespace(namespace);

    const BATCH_SIZE = 100;
    let totalUpserted = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      // Cast to any to satisfy TypeScript - Pinecone accepts our metadata structure
      await ns.upsert(batch as any);
      totalUpserted += batch.length;
    }

    return totalUpserted;
  } catch (error) {
    console.error('❌ Error en upsertChunksWithVectors:', error);
    throw error;
  }
}

// =====================================================
// QUERY FUNCTIONS
// =====================================================

/**
 * Consulta chunks similares en Pinecone usando Pinecone Inference API
 * 
 * Proceso en 2 pasos:
 * 1. Genera embedding del query con client.inference.embed()
 * 2. Busca vectores similares usando el embedding generado
 * 
 * @param namespace - Namespace donde buscar (zona)
 * @param filter - Filtros de metadata (development, type)
 * @param queryText - Texto de la consulta
 * @param topK - Número de resultados a retornar (default: 5)
 * @returns Array de matches con scores y metadata
 */
export async function queryChunks(
  namespace: string,
  filter: PineconeFilter,
  queryText: string,
  topK: number = 5
): Promise<PineconeMatch[]> {
  try {
    console.log(`🔍 Buscando: "${queryText.substring(0, 50)}..."`);
    
    // ========================================
    // PASO 0: Procesar query (corrección ortográfica + expansión semántica)
    // ========================================
    const processedQuery = processQuery(queryText);
    console.log(`🔧 Query procesado: "${processedQuery.substring(0, 50)}..."`);
    
    // Si el query procesado es diferente, loguear la mejora
    if (processedQuery !== queryText) {
      console.log(`✨ Query mejorado: "${queryText}" → "${processedQuery}"`);
    }
    
    // ========================================
    // PASO 1: Generar embedding del query procesado con Inference API
    // ========================================
    const client = await initPinecone();
    console.log(`🧠 Generando embedding del query con llama-text-embed-v2...`);
    
    const embeddings = await client.inference.embed(
      'llama-text-embed-v2',
      [processedQuery],           // ✅ Usar el query procesado (corregido y expandido)
      { inputType: 'query' }      // ✅ 'query' para búsquedas (no 'passage')
    );
    
    // Validar que el embedding tiene valores
    if (!embeddings[0]?.values || embeddings[0].values.length === 0) {
      throw new Error('❌ Pinecone Inference no generó valores para el query');
    }
    
    const queryVector = embeddings[0].values;
    console.log(`✅ Embedding del query generado (${queryVector.length} dimensiones)`);
    
    // ========================================
    // PASO 2: Buscar vectores similares
    // ========================================
    const index = await getPineconeIndex();
    const ns = index.namespace(namespace);

    const pineconeFilter: Record<string, unknown> = {
      development: { $eq: filter.development },
    };

    if (filter.type) {
      pineconeFilter.type = { $eq: filter.type };
    }

    const response = await ns.query({
      vector: queryVector,        // ✅ Usamos el vector generado
      topK: topK * 2,             // Buscar más resultados para re-ranking
      filter: pineconeFilter,
      includeMetadata: true,
    });

    // Mapear matches iniciales
    const initialMatches: PineconeMatch[] = (response.matches || []).map((match) => {
      const metadata = match.metadata as any;
      return {
        id: match.id,
        score: match.score || 0,
        metadata: {
          text: metadata?.text || '',
          zone: metadata?.zone || namespace,
          development: metadata?.development || filter.development,
          type: metadata?.type || 'general',
          page: metadata?.page || 0,
          chunk: metadata?.chunk || 0,
          sourceFileName: metadata?.sourceFileName || '',
          uploaded_by: metadata?.uploaded_by || 0,
          created_at: metadata?.created_at || '',
        },
      };
    });

    // ========================================
    // RE-RANKING INTELIGENTE
    // ========================================
    // Aplicar re-ranking basado en estadísticas de chunks
    try {
      const chunkIds = initialMatches.map(m => m.id);
      const chunkStats = await getMultipleChunkStats(chunkIds);
      
      // Calcular score final: similarity_score * 0.8 + success_ratio * 0.2
      const reRankedMatches = initialMatches.map(match => {
        const stats = chunkStats.get(match.id);
        const successRatio = stats?.success_ratio || 0.5; // Default 0.5 si no hay datos
        const finalScore = (match.score * 0.8) + (successRatio * 0.2);
        
        return {
          ...match,
          score: finalScore,
          originalScore: match.score, // Guardar score original para referencia
        };
      });
      
      // Ordenar por score final y tomar solo topK
      const sortedMatches = reRankedMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(match => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata,
        }));
      
      // Si no encontramos suficientes resultados con buen score, intentar con variantes del query
      const goodMatches = sortedMatches.filter(m => m.score >= 0.5); // Umbral de relevancia
      
      if (goodMatches.length < topK && goodMatches.length < 3) {
        console.log(`⚠️ Pocos resultados relevantes (${goodMatches.length}), intentando con variantes del query...`);
        
        try {
          // Generar variantes del query y buscar con ellas
          const variants = generateQueryVariants(queryText);
          const allMatches = new Map<string, PineconeMatch>(); // Usar Map para evitar duplicados
          
          // Agregar los matches que ya tenemos
          sortedMatches.forEach(match => {
            allMatches.set(match.id, match);
          });
          
          // Buscar con las 2-3 mejores variantes (no todas para no hacer demasiadas llamadas)
          const topVariants = variants.slice(1, 4); // Saltar el primero (ya lo usamos)
          
          for (const variant of topVariants) {
            try {
              const variantEmbeddings = await client.inference.embed(
                'llama-text-embed-v2',
                [variant],
                { inputType: 'query' }
              );
              
              if (variantEmbeddings[0]?.values) {
                const variantVector = variantEmbeddings[0].values;
                const variantResponse = await ns.query({
                  vector: variantVector,
                  topK: Math.min(topK, 3), // Buscar menos resultados por variante
                  filter: pineconeFilter,
                  includeMetadata: true,
                });
                
                // Agregar matches de la variante que no estén ya en la lista
                (variantResponse.matches || []).forEach(match => {
                  if (!allMatches.has(match.id || '')) {
                    const metadata = match.metadata as any;
                    allMatches.set(match.id || '', {
                      id: match.id || '',
                      score: match.score || 0,
                      metadata: {
                        text: metadata?.text || '',
                        zone: metadata?.zone || namespace,
                        development: metadata?.development || filter.development,
                        type: metadata?.type || 'general',
                        page: metadata?.page || 0,
                        chunk: metadata?.chunk || 0,
                        sourceFileName: metadata?.sourceFileName || '',
                        uploaded_by: metadata?.uploaded_by || 0,
                        created_at: metadata?.created_at || '',
                      },
                    });
                  }
                });
              }
            } catch (variantError) {
              console.log(`⚠️ Error buscando con variante "${variant}":`, variantError);
              // Continuar con la siguiente variante
            }
          }
          
          // Convertir Map a Array, ordenar por score y tomar topK
          const finalMatches = Array.from(allMatches.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
          
          if (finalMatches.length > sortedMatches.length) {
            console.log(`✅ Encontrados ${finalMatches.length} resultados usando variantes del query`);
            return finalMatches;
          }
        } catch (variantError) {
          console.log('⚠️ Error en búsqueda con variantes, usando resultados originales:', variantError);
        }
      }
      
      console.log(`✅ Encontrados ${sortedMatches.length} resultados (re-ranked con estadísticas)`);
      return sortedMatches;
    } catch {
      // Si hay error obteniendo stats, usar resultados originales
      console.log('⚠️ Error obteniendo estadísticas de chunks, usando resultados sin re-ranking');
      const matches = initialMatches.slice(0, topK);
      console.log(`✅ Encontrados ${matches.length} resultados`);
      return matches;
    }
  } catch (error) {
    console.error('❌ Error en queryChunks:', error);
    throw error;
  }
}
/**
 * Versión alternativa de query usando vectores directamente
 */
export async function queryChunksWithVector(
  namespace: string,
  filter: PineconeFilter,
  queryVector: number[],
  topK: number = 5
): Promise<PineconeMatch[]> {
  try {
    const index = await getPineconeIndex();
    const ns = index.namespace(namespace);

    const pineconeFilter: Record<string, unknown> = {
      development: { $eq: filter.development },
    };

    if (filter.type) {
      pineconeFilter.type = { $eq: filter.type };
    }

    const response = await ns.query({
      vector: queryVector,
      topK,
      filter: pineconeFilter,
      includeMetadata: true,
    });

    const matches: PineconeMatch[] = (response.matches || []).map((match) => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata as unknown as ChunkMetadata & { text?: string },
    }));

    return matches;
  } catch (error) {
    console.error('❌ Error en queryChunksWithVector:', error);
    throw error;
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Elimina todos los vectores de un namespace
 * @param namespace - Namespace a limpiar
 */
export async function deleteNamespace(namespace: string): Promise<void> {
  try {
    const index = await getPineconeIndex();
    await index.namespace(namespace).deleteAll();
    console.log(`🗑️ Namespace "${namespace}" eliminado`);
  } catch (error) {
    console.error('❌ Error eliminando namespace:', error);
    throw error;
  }
}

/**
 * Elimina vectores específicos por ID
 * @param namespace - Namespace donde están los vectores
 * @param ids - Array de IDs a eliminar
 */
export async function deleteByIds(namespace: string, ids: string[]): Promise<void> {
  try {
    const index = await getPineconeIndex();
    await index.namespace(namespace).deleteMany(ids);
    console.log(`🗑️ Eliminados ${ids.length} vectores de namespace "${namespace}"`);
  } catch (error) {
    console.error('❌ Error eliminando vectores:', error);
    throw error;
  }
}

/**
 * Elimina todos los vectores de un documento específico usando filtro de metadata
 * @param namespace - Namespace donde están los vectores (zona)
 * @param sourceFileName - Nombre del archivo fuente a eliminar
 */
export async function deleteDocumentChunks(
  namespace: string, 
  sourceFileName: string
): Promise<void> {
  try {
    const index = await getPineconeIndex();
    
    // Pinecone permite eliminar usando filtros de metadata
    // Eliminamos todos los chunks que tienen este sourceFileName
    await index.namespace(namespace).deleteMany({
      sourceFileName: sourceFileName
    });
    
    console.log(`🗑️ Chunks eliminados del documento "${sourceFileName}" en namespace "${namespace}"`);
  } catch (error) {
    console.error('❌ Error eliminando chunks del documento:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas del índice
 */
export async function getIndexStats(): Promise<object> {
  try {
    const index = await getPineconeIndex();
    const stats = await index.describeIndexStats();
    return stats;
  } catch (error) {
    console.error('❌ Error obteniendo stats:', error);
    throw error;
  }
}

/**
 * Obtiene todos los chunks de un documento específico
 * @param namespace - Namespace donde están los vectores (zona)
 * @param sourceFileName - Nombre del archivo fuente
 * @returns Array de chunks con sus metadatos
 */
export async function getDocumentChunks(
  namespace: string,
  sourceFileName: string
): Promise<PineconeMatch[]> {
  try {
    const index = await getPineconeIndex();
    const ns = index.namespace(namespace);
    
    // Usar query con un vector dummy (todos ceros) y un filtro específico
    // La dimensión del vector es 1024 (llama-text-embed-v2)
    const DIMENSION = 1024;
    const dummyVector = new Array(DIMENSION).fill(0);
    
    // Hacer una query con topK alto para obtener todos los chunks
    // Usamos un topK de 10000 que debería ser suficiente para la mayoría de documentos
    const response = await ns.query({
      vector: dummyVector,
      topK: 10000, // Número alto para obtener todos los chunks
      filter: {
        sourceFileName: { $eq: sourceFileName }
      },
      includeMetadata: true,
    });
    
    // Mapear los resultados a PineconeMatch
    const chunks: PineconeMatch[] = (response.matches || []).map((match) => {
      const metadata = match.metadata as any;
      return {
        id: match.id,
        score: match.score || 0,
        metadata: {
          text: metadata?.text || '',
          zone: metadata?.zone || namespace,
          development: metadata?.development || '',
          type: metadata?.type || 'general',
          page: metadata?.page || 0,
          chunk: metadata?.chunk || 0,
          sourceFileName: metadata?.sourceFileName || sourceFileName,
          uploaded_by: metadata?.uploaded_by || 0,
          created_at: metadata?.created_at || '',
        },
      };
    });
    
    // Ordenar por chunk number para mantener el orden del documento
    chunks.sort((a, b) => {
      if (a.metadata.page !== b.metadata.page) {
        return a.metadata.page - b.metadata.page;
      }
      return a.metadata.chunk - b.metadata.chunk;
    });
    
    console.log(`✅ Obtenidos ${chunks.length} chunks del documento "${sourceFileName}"`);
    return chunks;
  } catch (error) {
    console.error('❌ Error obteniendo chunks del documento:', error);
    throw error;
  }
}

/**
 * Construye contexto a partir de matches de Pinecone
 * @param matches - Array de matches de Pinecone
 * @returns Texto de contexto concatenado
 */
export function buildContextFromMatches(matches: PineconeMatch[]): string {
  if (!matches || matches.length === 0) {
    return '';
  }

  return matches
    .map((match, index) => {
      const source = match.metadata.sourceFileName || 'Documento desconocido';
      const page = match.metadata.page || 0;
      const text = match.metadata.text || '';
      
      return `[Fuente ${index + 1}: ${source}, Página ${page}]\n${text}`;
    })
    .join('\n\n---\n\n');
}

export default {
  initPinecone,
  getPineconeIndex,
  upsertChunks,
  upsertChunksWithVectors,
  queryChunks,
  queryChunksWithVector,
  deleteNamespace,
  deleteByIds,
  getIndexStats,
  getDocumentChunks,
  buildContextFromMatches,
};

