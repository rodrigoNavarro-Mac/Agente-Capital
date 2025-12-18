/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - RAG QUERY API ENDPOINT
 * =====================================================
 * Endpoint para realizar consultas RAG:
 * 1. Busca contexto relevante en Pinecone
 * 2. Envía el contexto al LLM configurado (LM Studio, OpenAI, etc.)
 * 3. Retorna la respuesta del agente
 */

import { NextRequest, NextResponse } from 'next/server';

// Importar utilidades
import { queryChunks, buildContextFromMatches } from '@/lib/pinecone';
import { runRAGQuery, runSimpleQuery, checkLMStudioHealth } from '@/lib/llm';
import { checkUserAccess, hasPermission, saveQueryLog, getConfig, getUserById, registerQueryChunks, getAgentMemories, getLearnedResponse, incrementLearnedResponseUsage } from '@/lib/postgres';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth';
import { generatePreview } from '@/lib/cleanText';
import { findCachedResponse, saveToCache } from '@/lib/cache';
import { processQuery } from '@/lib/queryProcessing';
import { logger } from '@/lib/logger';
import { validateRequest, ragQueryRequestSchema } from '@/lib/validation';

import type { 
  Zone, 
  DocumentContentType, 
  RAGQueryResponse,
  SourceReference,
  PineconeMatch 
} from '@/types/documents';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const DEFAULT_TOP_K = 5;

// =====================================================
// DETECCIÓN DE CONSULTAS SIMPLES
// =====================================================

/**
 * Detecta si una consulta es simple (saludo, pregunta general) que no requiere búsqueda en Pinecone
 * @param query - Texto de la consulta
 * @returns true si es una consulta simple que no requiere RAG
 */
function isSimpleQuery(query: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Patrones de saludos y preguntas simples
  const simplePatterns = [
    // Saludos
    /^(hola|hi|hello|buenos días|buenas tardes|buenas noches|saludos|hey)[\s!.,]*$/i,
    /^(hola|hi|hello|buenos días|buenas tardes|buenas noches|saludos|hey)\s+(amigo|amiga|señor|señora|equipo|team)[\s!.,]*$/i,
    
    // Preguntas muy cortas sin contexto específico
    /^(qué tal|qué pasa|qué hay|qué onda|como estás|como estas|how are you)[\s?.,]*$/i,
    
    // Consultas de una sola palabra muy corta
    /^[a-záéíóúñ]{1,4}[\s?.,!]*$/i,
    
    // Preguntas sobre el sistema mismo
    /^(quién eres|quien eres|qué eres|que eres|qué puedes hacer|que puedes hacer|help|ayuda|help me)[\s?.,]*$/i,
  ];

  // Verificar si coincide con algún patrón simple
  for (const pattern of simplePatterns) {
    if (pattern.test(normalizedQuery)) {
      return true;
    }
  }

  // Si la consulta es muy corta (menos de 10 caracteres sin espacios), probablemente es simple
  if (normalizedQuery.replace(/\s+/g, '').length < 10) {
    // Excepciones: palabras clave que SÍ requieren búsqueda
    const requiresRAG = [
      'precio', 'precios', 'costo', 'costos',
      'amenidad', 'amenidades', 'característica', 'caracteristicas',
      'inventario', 'disponibilidad', 'unidad', 'unidades',
      'documento', 'documentos', 'brochure', 'folleto',
    ];
    
    const hasRAGKeyword = requiresRAG.some(keyword => 
      normalizedQuery.includes(keyword)
    );
    
    if (!hasRAGKeyword) {
      return true;
    }
  }

  return false;
}

// =====================================================
// ENDPOINT POST - RAG QUERY
// =====================================================

export async function POST(request: NextRequest): Promise<NextResponse<RAGQueryResponse>> {
  const startTime = Date.now();
  const logScope = 'rag-query';

  try {
    // 1. Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No autorizado' 
        },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Token inválido o expirado' 
        },
        { status: 401 }
      );
    }

    // 2. Parsear y validar el body con Zod
    const rawBody = await request.json();
    const validation = validateRequest(ragQueryRequestSchema, rawBody, logScope);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: validation.error 
        },
        { status: validation.status }
      );
    }
    
    const { query, zone, development, type, userId: bodyUserId, skipCache } = validation.data;

    // 3. Usar el userId del token autenticado, no del body (por seguridad)
    // Si el body tiene userId, solo se usa si el usuario es admin
    const currentUser = await getUserById(payload.userId);
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'ceo';
    
    // Usuarios normales siempre usan su propio userId
    // Administradores pueden usar el userId del body si se especifica
    const userId = (isAdmin && bodyUserId) ? bodyUserId : payload.userId;

    if (query.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'La consulta no puede exceder 2000 caracteres' },
        { status: 400 }
      );
    }

    // 7. Verificar permisos del usuario
    const hasQueryPermission = await hasPermission(userId, 'query_agent');
    const hasZoneAccess = await checkUserAccess(userId, zone as Zone, development, 'can_query');
    
    if (!hasQueryPermission || !hasZoneAccess) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para consultar este desarrollo' },
        { status: 403 }
      );
    }

    // 8. Procesar query (corrección ortográfica y expansión semántica)
    // Nota: El procesamiento también se hace dentro de queryChunks, pero lo hacemos aquí
    // para mejorar el caché y el logging
    const processedQuery = processQuery(query);

    // 9. Verificar que el proveedor LLM configurado está disponible
    const llmAvailable = await checkLMStudioHealth();
    if (!llmAvailable) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'El servidor LLM no está disponible. Por favor, verifica la configuración del proveedor LLM.' 
        },
        { status: 503 }
      );
    }

    // 10. Buscar en caché primero (solo para consultas no simples y si no se solicita skipCache)
    // Usar el query procesado para el caché también
    const isSimple = isSimpleQuery(query);
    const shouldSkipCache = skipCache === true; // Si se solicita, ignorar caché
    let answer: string = ''; // Inicializar con string vacío para evitar error de TypeScript
    let sources: SourceReference[] = [];
    let matches: PineconeMatch[] = [];
    let fromCache = false;

    if (!isSimple && !shouldSkipCache) {
      // Buscar en caché antes de procesar (usar query procesado para mejor matching)
      const cachedResult = await findCachedResponse(
        processedQuery, // ✅ Usar query procesado para mejor matching en caché
        zone as Zone,
        development,
        type as DocumentContentType | undefined
      );

      if (cachedResult && cachedResult.similarity >= 0.85) {
        logger.debug('Using cached response', { similarity: cachedResult.similarity }, logScope);
        // Usar respuesta del caché
        answer = cachedResult.entry.response;
        
        // Construir fuentes desde el caché
        // Si hay sources_used, usarlos; si no, array vacío
        if (cachedResult.entry.sources_used && cachedResult.entry.sources_used.length > 0) {
          sources = cachedResult.entry.sources_used.map((filename) => ({
            filename,
            page: 0,
            chunk: 0,
            relevance_score: cachedResult.similarity, // Usar la similitud del caché como score
            text_preview: '',
          }));
          logger.debug('Cached response has sources', { similarity: cachedResult.similarity, sourcesCount: sources.length }, logScope);
        } else {
          sources = [];
          logger.debug('Cached response without sources', { similarity: cachedResult.similarity }, logScope);
        }
        
        fromCache = true;
      }
    } else if (shouldSkipCache) {
      logger.debug('Skipping cache (forced regeneration)', undefined, logScope);
    }

    // 10.5. Si no hay respuesta del caché, buscar respuestas aprendidas
    // Solo buscar si no se está forzando a ignorar el caché y no hay respuesta aún
    if (!fromCache && !answer && !shouldSkipCache) {
      const learnedResponse = await getLearnedResponse(processedQuery);
      if (learnedResponse && learnedResponse.quality_score >= 0.7) {
        logger.debug('Using learned response', {
          qualityScore: learnedResponse.quality_score,
          usageCount: learnedResponse.usage_count,
        }, logScope);
        
        // Incrementar contador de uso
        await incrementLearnedResponseUsage(processedQuery);
        
        // Construir respuesta con la respuesta aprendida
        answer = learnedResponse.answer;
        
        // Intentar obtener fuentes del caché si están disponibles
        const cachedResult = await findCachedResponse(
          processedQuery,
          zone as Zone,
          development,
          type as DocumentContentType | undefined
        );
        
        if (cachedResult && cachedResult.entry.sources_used && cachedResult.entry.sources_used.length > 0) {
          sources = cachedResult.entry.sources_used.map((filename) => ({
            filename,
            page: 0,
            chunk: 0,
            relevance_score: cachedResult.similarity,
            text_preview: '',
          }));
        } else {
          sources = [];
        }
        
        fromCache = false; // No es caché, es respuesta aprendida
      }
    }

    if (!fromCache && !answer) {
      if (isSimple) {
        // Consulta simple: responder directamente sin buscar en Pinecone
        logger.debug('Simple query detected; responding without RAG', undefined, logScope);
        answer = await runSimpleQuery(query);
        logger.debug('Simple response generated', undefined, logScope);
      } else {
        // Consulta compleja: usar RAG con búsqueda en Pinecone
        logger.debug('Complex query; using RAG', undefined, logScope);
        
        // 11. Obtener configuración dinámica
        const topKConfig = await getConfig('top_k');
        const topK = topKConfig ? parseInt(topKConfig) : DEFAULT_TOP_K;

        // 12. Buscar en Pinecone (usando query procesado)
        const namespace = zone;
        const filter = {
          development,
          ...(type && { type: type as DocumentContentType }),
        };

        logger.debug('Querying Pinecone', { namespace, filter, topK }, logScope);

        // ✅ Usar query procesado para mejor búsqueda semántica
        matches = await queryChunks(namespace, filter, processedQuery, topK);
        logger.debug('Pinecone matches found', { count: matches.length }, logScope);

        // 13. Construir contexto desde los matches
        const context = buildContextFromMatches(matches);

        // 13.5. Cargar memoria operativa del agente
        const memories = await getAgentMemories(0.7); // Cargar memorias con importancia >= 0.7
        if (memories.length > 0) {
          logger.debug('Agent memories loaded', { count: memories.length }, logScope);
        }

        // 14. Enviar al LLM con contexto RAG y memoria operativa
        // Usar el query original (no procesado) para la respuesta, pero el contexto ya tiene
        // la información relevante gracias al query procesado
        logger.debug('Sending request to LLM (RAG)', undefined, logScope);
        answer = await runRAGQuery(query, context, type, memories, matches);
        logger.debug('RAG response received from LLM', undefined, logScope);

        // 15. Preparar referencias de fuentes
        sources = buildSourceReferences(matches);

        // 16. Guardar en caché para futuras consultas (solo si no es simple)
        // Guardar con el query procesado para mejor matching futuro
        // NOTA: saveToCache ya verifica si hay feedback negativo antes de guardar
        if (!isSimple && answer) {
          await saveToCache(
            processedQuery, // ✅ Guardar con query procesado para mejor matching
            zone as Zone,
            development,
            answer,
            sources,
            type as DocumentContentType | undefined
          );
        }
      }
    }

    // 17. Calcular tiempo de respuesta
    const responseTimeMs = Date.now() - startTime;

    // Verificar que answer tenga un valor (seguridad)
    if (!answer || answer.trim() === '') {
      logger.error('Error: answer no fue asignado correctamente', undefined, {}, logScope);
      return NextResponse.json(
        {
          success: false,
          error: 'Error al generar respuesta',
        },
        { status: 500 }
      );
    }

    // 18. Guardar log de la consulta (usar query original para el log)
    const queryLog = await saveQueryLog({
      user_id: userId,
      query,
      zone: zone as Zone,
      development,
      response: answer,
      sources_used: sources.map(s => s.filename),
      response_time_ms: responseTimeMs,
    });
    
    // Validar que el user_id guardado sea correcto
    if (queryLog.user_id !== userId) {
      logger.error('ERROR CRÍTICO: El user_id guardado no coincide con el esperado', undefined, { 
        savedUserId: queryLog.user_id, 
        expectedUserId: userId 
      }, logScope);
    }

    // 14. Registrar chunks usados para tracking de desempeño
    if (matches && matches.length > 0) {
      const chunkIds = matches.map(m => m.id);
      await registerQueryChunks(queryLog.id, chunkIds);
    }

    // 15. Retornar respuesta
    logger.debug('Returning response', { sourcesCount: sources.length, sources: sources.map(s => s.filename) }, logScope);
    return NextResponse.json({
      success: true,
      answer,
      sources,
      query_log_id: queryLog.id,
    });

  } catch (error) {
    logger.error('Error en RAG query', error, {}, logScope);

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error procesando la consulta' 
      },
      { status: 500 }
    );
  }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Construye referencias de fuentes desde los matches de Pinecone
 */
function buildSourceReferences(matches: PineconeMatch[]): SourceReference[] {
  return matches.map((match) => ({
    filename: match.metadata.sourceFileName || 'Documento desconocido',
    page: match.metadata.page || 0,
    chunk: match.metadata.chunk || 0,
    relevance_score: Math.round(match.score * 100) / 100,
    text_preview: generatePreview(match.metadata.text || '', 150),
  }));
}

// =====================================================
// ENDPOINT GET - INFO Y HEALTH CHECK
// =====================================================

export async function GET(): Promise<NextResponse> {
  try {
    // Verificar salud de todos los proveedores
    const { getAllProvidersHealth } = await import('@/lib/llm');
    const healthStatus = await getAllProvidersHealth();

    return NextResponse.json({
      endpoint: '/api/rag-query',
      method: 'POST',
      description: 'Realiza una consulta RAG al agente de Capital Plus',
      health: {
        lmStudio: healthStatus.lmstudio ? 'available' : 'unavailable',
        openai: healthStatus.openai ? 'available' : 'unavailable',
        current: healthStatus.current,
      },
      requiredFields: {
        query: 'La pregunta a realizar (string, 3-2000 caracteres)',
        zone: 'Zona geográfica (yucatan, puebla, quintana_roo, etc.)',
        development: 'Nombre del desarrollo',
        userId: 'ID del usuario que realiza la consulta',
      },
      optionalFields: {
        type: 'Tipo de documento a filtrar (brochure, policy, price, etc.)',
      },
      responseFields: {
        success: 'boolean',
        answer: 'Respuesta del agente',
        sources: 'Array de fuentes utilizadas',
        query_log_id: 'ID del log de la consulta',
      },
      example: {
        request: {
          query: '¿Cuáles son las amenidades del desarrollo Riviera?',
          zone: 'yucatan',
          development: 'riviera',
          userId: 1,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Error obteniendo información del endpoint' },
      { status: 500 }
    );
  }
}

