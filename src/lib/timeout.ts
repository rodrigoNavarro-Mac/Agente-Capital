/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - TIMEOUT HELPER
 * =====================================================
 * Utilidades para implementar timeouts en llamadas externas
 * usando AbortController y Promise.race()
 * 
 * Previene que las funciones serverless excedan límites de tiempo
 * (Vercel: 10s Hobby, 60s Pro)
 */

import { logger } from '@/lib/logger';

// =====================================================
// CONFIGURACIÓN DE TIMEOUTS
// =====================================================

/**
 * Timeouts recomendados por tipo de operación (en milisegundos)
 */
export const TIMEOUTS = {
  // Pinecone: operaciones pueden ser lentas con muchos vectores
  PINECONE_EMBED: 30 * 1000,      // 30 segundos para generar embeddings
  PINECONE_QUERY: 15 * 1000,      // 15 segundos para queries
  PINECONE_UPSERT: 30 * 1000,     // 30 segundos para upsert
  
  // LLM: generación de texto puede tomar tiempo
  LLM_REQUEST: 60 * 1000,         // 60 segundos para respuestas LLM
  LLM_STREAM: 120 * 1000,          // 120 segundos para streaming
  
  // Zoho: API externa, puede tener latencia variable
  ZOHO_REQUEST: 20 * 1000,         // 20 segundos para requests a Zoho
  ZOHO_SYNC: 120 * 1000,            // 120 segundos para sincronizaciones completas
  
  // General: timeout por defecto
  DEFAULT: 30 * 1000,               // 30 segundos por defecto
} as const;

// =====================================================
// HELPER DE TIMEOUT CON ABORTCONTROLLER
// =====================================================

/**
 * Crea una promesa que se rechaza después del timeout especificado
 * @param timeoutMs - Tiempo en milisegundos antes de rechazar
 * @param message - Mensaje de error cuando se excede el timeout
 * @returns AbortSignal y la promesa de timeout
 */
export function createTimeout(
  timeoutMs: number,
  message: string = 'Operación excedió el tiempo límite'
): { signal: AbortSignal; timeoutPromise: Promise<never> } {
  const controller = new AbortController();
  const signal = controller.signal;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(message, timeoutMs));
    }, timeoutMs);
    
    // Limpiar timeout si la señal es abortada externamente
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
    });
  });
  
  return { signal, timeoutPromise };
}

/**
 * Error personalizado para timeouts
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(`${message} (timeout: ${timeoutMs}ms)`);
    this.name = 'TimeoutError';
  }
}

// =====================================================
// WRAPPER PARA FETCH CON TIMEOUT
// =====================================================

/**
 * Wrapper para fetch() con timeout automático
 * @param url - URL a la que hacer la petición
 * @param options - Opciones de fetch (puede incluir signal)
 * @param timeoutMs - Tiempo máximo en milisegundos (default: TIMEOUTS.DEFAULT)
 * @returns Response de fetch
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUTS.DEFAULT
): Promise<Response> {
  const { signal: timeoutSignal, timeoutPromise } = createTimeout(
    timeoutMs,
    `Request a ${url} excedió el tiempo límite`
  );
  
  // Combinar signals si ya hay uno en options
  const existingSignal = options.signal;
  let combinedSignal: AbortSignal | undefined;
  
  if (existingSignal) {
    // Si ya hay un signal, crear uno combinado que se active si cualquiera se aborta
    const combinedController = new AbortController();
    const abortHandler = () => combinedController.abort();
    
    existingSignal.addEventListener('abort', abortHandler);
    timeoutSignal.addEventListener('abort', abortHandler);
    
    combinedSignal = combinedController.signal;
  } else {
    combinedSignal = timeoutSignal;
  }
  
  try {
    const fetchPromise = fetch(url, {
      ...options,
      signal: combinedSignal,
    });
    
    // Race entre fetch y timeout
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.error('Request timeout', error, { url, timeoutMs }, 'timeout');
      throw error;
    }
    // Si es un AbortError, verificar si fue por timeout
    if (error instanceof Error && error.name === 'AbortError') {
      if (timeoutSignal.aborted) {
        const timeoutError = new TimeoutError(
          `Request a ${url} excedió el tiempo límite`,
          timeoutMs
        );
        logger.error('Request aborted due to timeout', timeoutError, { url, timeoutMs }, 'timeout');
        throw timeoutError;
      }
    }
    throw error;
  }
}

// =====================================================
// WRAPPER PARA PROMESAS CON TIMEOUT
// =====================================================

/**
 * Aplica un timeout a cualquier promesa
 * @param promise - Promesa a la que aplicar timeout
 * @param timeoutMs - Tiempo máximo en milisegundos
 * @param errorMessage - Mensaje de error cuando se excede el timeout
 * @returns Resultado de la promesa o lanza TimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operación excedió el tiempo límite'
): Promise<T> {
  const { timeoutPromise } = createTimeout(timeoutMs, errorMessage);
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.error('Operation timeout', error, { timeoutMs, errorMessage }, 'timeout');
      throw error;
    }
    throw error;
  }
}

// =====================================================
// WRAPPER ESPECÍFICO PARA OPERACIONES ASYNC
// =====================================================

/**
 * Wrapper para operaciones async con timeout y retry opcional
 * @param operation - Función async a ejecutar
 * @param timeoutMs - Tiempo máximo en milisegundos
 * @param operationName - Nombre de la operación (para logging)
 * @returns Resultado de la operación
 */
export async function executeWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const { signal, timeoutPromise } = createTimeout(
    timeoutMs,
    `${operationName} excedió el tiempo límite de ${timeoutMs}ms`
  );
  
  try {
    const operationPromise = operation(signal);
    return await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.error('Operation timeout', error, { operationName, timeoutMs }, 'timeout');
      throw error;
    }
    // Si es AbortError por timeout
    if (error instanceof Error && error.name === 'AbortError' && signal.aborted) {
      const timeoutError = new TimeoutError(
        `${operationName} excedió el tiempo límite`,
        timeoutMs
      );
      logger.error('Operation aborted due to timeout', timeoutError, { operationName, timeoutMs }, 'timeout');
      throw timeoutError;
    }
    throw error;
  }
}

