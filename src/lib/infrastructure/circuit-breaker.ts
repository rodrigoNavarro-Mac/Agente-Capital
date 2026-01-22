/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - CIRCUIT BREAKER
 * =====================================================
 * Implementa un circuit breaker para prevenir reconexiones
 * fallidas repetidas cuando la base de datos no está disponible.
 * 
 * Estados:
 * - CLOSED: Funcionando normalmente
 * - OPEN: Fallos detectados, rechazando requests
 * - HALF_OPEN: Probando si el servicio se recuperó
 */

import { logger } from '@/lib/utils/logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

// Detectar si estamos en desarrollo local
const isLocalDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

const CIRCUIT_BREAKER_CONFIG = {
  // Número de fallos consecutivos antes de abrir el circuito
  // Más permisivo en desarrollo local para soportar navegación normal
  FAILURE_THRESHOLD: isLocalDev ? 15 : 5,
  
  // Tiempo en ms que el circuito permanece abierto antes de intentar half-open
  // Reducido a 15 segundos para recuperación más rápida
  TIMEOUT: 15000, // 15 segundos (reducido de 30s para recuperación más rápida)
  
  // Tiempo en ms para esperar antes de reintentar después de un fallo
  RESET_TIMEOUT: 10000, // 10 segundos
} as const;

// =====================================================
// TIPOS
// =====================================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  successCount: number;
}

// =====================================================
// CIRCUIT BREAKER GLOBAL PARA POSTGRES
// =====================================================

const postgresCircuitBreaker: CircuitBreakerState = {
  state: 'CLOSED',
  failureCount: 0,
  lastFailureTime: null,
  successCount: 0,
};

// =====================================================
// FUNCIONES DEL CIRCUIT BREAKER
// =====================================================

/**
 * Verifica si el circuito está abierto y debe rechazar la operación
 * @param allowRetry - Si es true, permite un intento incluso si está OPEN (útil para operaciones críticas)
 * @returns true si el circuito está abierto y debe rechazar
 */
export function isCircuitOpen(allowRetry: boolean = false): boolean {
  const now = Date.now();
  
  // Si está CLOSED, permitir
  if (postgresCircuitBreaker.state === 'CLOSED') {
    return false;
  }
  
  // Si está OPEN, verificar si ha pasado el timeout
  if (postgresCircuitBreaker.state === 'OPEN') {
    if (postgresCircuitBreaker.lastFailureTime && 
        (now - postgresCircuitBreaker.lastFailureTime) >= CIRCUIT_BREAKER_CONFIG.TIMEOUT) {
      // Cambiar a HALF_OPEN para probar si el servicio se recuperó
      postgresCircuitBreaker.state = 'HALF_OPEN';
      postgresCircuitBreaker.successCount = 0;
      logger.info('Circuit breaker: OPEN -> HALF_OPEN (probando recuperación)', {}, 'circuit-breaker');
      return false; // Permitir un intento
    }
    
    // Si allowRetry es true y han pasado al menos 5 segundos desde el último fallo,
    // permitir un intento de recuperación (útil para operaciones críticas como login)
    if (allowRetry && postgresCircuitBreaker.lastFailureTime && 
        (now - postgresCircuitBreaker.lastFailureTime) >= 5000) {
      logger.info('Circuit breaker: Permitido intento de recuperación (operación crítica)', {
        timeSinceLastFailure: now - postgresCircuitBreaker.lastFailureTime
      }, 'circuit-breaker');
      return false; // Permitir intento
    }
    
    return true; // Rechazar
  }
  
  // Si está HALF_OPEN, permitir (ya estamos probando)
  return false;
}

/**
 * Registra un éxito en el circuito breaker
 */
export function recordSuccess(): void {
  if (postgresCircuitBreaker.state === 'HALF_OPEN') {
    // Si estamos en HALF_OPEN y tenemos éxito, cerrar el circuito
    postgresCircuitBreaker.successCount++;
    if (postgresCircuitBreaker.successCount >= 2) {
      // Necesitamos 2 éxitos consecutivos para cerrar completamente
      postgresCircuitBreaker.state = 'CLOSED';
      postgresCircuitBreaker.failureCount = 0;
      postgresCircuitBreaker.lastFailureTime = null;
      postgresCircuitBreaker.successCount = 0;
      logger.info('Circuit breaker: HALF_OPEN -> CLOSED (servicio recuperado)', {}, 'circuit-breaker');
    }
  } else if (postgresCircuitBreaker.state === 'CLOSED') {
    // Si está CLOSED, resetear contador de fallos en caso de éxito
    if (postgresCircuitBreaker.failureCount > 0) {
      postgresCircuitBreaker.failureCount = 0;
    }
  }
}

/**
 * Registra un fallo en el circuito breaker
 * @param error - Error que ocurrió
 */
export function recordFailure(error: unknown): void {
  const now = Date.now();
  postgresCircuitBreaker.failureCount++;
  postgresCircuitBreaker.lastFailureTime = now;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Verificar si es un error de configuración (NO debe abrir el circuit breaker)
  const isConfigurationError = error instanceof Error && (
    error.message.includes('Tenant or user not found') ||
    error.message.includes('invalid oauth token') ||
    error.message.includes('authentication failed') ||
    error.message.includes('password authentication failed') ||
    error.message.includes('role') && error.message.includes('does not exist')
  );
  
  // Si es un error de configuración, no afectar el circuit breaker
  // Estos errores indican problemas de configuración, no de disponibilidad de la BD
  if (isConfigurationError) {
    logger.warn('Circuit breaker: Error de configuración detectado (no afecta circuit breaker)', { 
      error: errorMessage.substring(0, 150),
      state: postgresCircuitBreaker.state,
    }, 'circuit-breaker');
    return; // No contar este fallo en el circuit breaker
  }
  
  // Verificar si es un error de conexión
  const isConnectionError = error instanceof Error && (
    error.message.includes('shutdown') ||
    error.message.includes('db_termination') ||
    error.message.includes('terminating connection') ||
    error.message.includes('Connection terminated') ||
    error.message.includes('server closed the connection') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    (error as Error & { code?: string }).code === 'XX000' ||
    (error as Error & { code?: string }).code === '57P01' ||
    (error as Error & { code?: string }).code === 'ECONNRESET' ||
    (error as Error & { code?: string }).code === 'ECONNREFUSED'
  );
  
  // Verificar si es un error de límite de conexiones (menos crítico)
  const isMaxConnectionsError = error instanceof Error && (
    error.message.includes('MaxClientsInSessionMode') ||
    error.message.includes('max clients reached') ||
    error.message.includes('max client connections')
  );
  
  // En desarrollo local, los errores de límite de conexiones son menos críticos
  // No deberían abrir el circuit breaker tan rápido
  if (isMaxConnectionsError && isLocalDev) {
    // Solo incrementar el contador cada 3 errores de límite de conexiones
    // Esto hace que el circuit breaker sea más tolerante a estos errores en desarrollo
    const maxConnectionErrorCount = (postgresCircuitBreaker as any).maxConnectionErrorCount || 0;
    (postgresCircuitBreaker as any).maxConnectionErrorCount = maxConnectionErrorCount + 1;
    
    if (maxConnectionErrorCount % 3 !== 0) {
      // No incrementar el contador principal en los primeros 2 de cada 3 errores
      logger.debug('Circuit breaker: Error de límite de conexiones (ignorado para evitar apertura prematura)', { 
        failureCount: postgresCircuitBreaker.failureCount,
        maxConnectionErrors: maxConnectionErrorCount,
        state: postgresCircuitBreaker.state,
      }, 'circuit-breaker');
      return; // No contar este fallo
    }
    
    // Cada 3 errores, incrementar el contador principal
    logger.warn('Circuit breaker: Error de límite de conexiones (contado parcialmente en desarrollo)', { 
      failureCount: postgresCircuitBreaker.failureCount,
      maxConnectionErrors: maxConnectionErrorCount,
      state: postgresCircuitBreaker.state,
    }, 'circuit-breaker');
  }
  
  if (!isConnectionError && !isMaxConnectionsError) {
    // Si no es error de conexión ni de límite, no afectar el circuit breaker
    return;
  }
  
  logger.warn('Circuit breaker: Fallo registrado', { 
    failureCount: postgresCircuitBreaker.failureCount,
    state: postgresCircuitBreaker.state,
    error: errorMessage.substring(0, 100)
  }, 'circuit-breaker');
  
  // Si alcanzamos el umbral de fallos, abrir el circuito
  if (postgresCircuitBreaker.failureCount >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
    if (postgresCircuitBreaker.state !== 'OPEN') {
      postgresCircuitBreaker.state = 'OPEN';
      logger.error('Circuit breaker: CLOSED -> OPEN (demasiados fallos)', undefined, {
        failureCount: postgresCircuitBreaker.failureCount,
        threshold: CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD
      }, 'circuit-breaker');
    }
  }
  
  // Si estamos en HALF_OPEN y fallamos, volver a OPEN
  if (postgresCircuitBreaker.state === 'HALF_OPEN') {
    postgresCircuitBreaker.state = 'OPEN';
    postgresCircuitBreaker.successCount = 0;
    logger.warn('Circuit breaker: HALF_OPEN -> OPEN (fallo durante prueba)', {}, 'circuit-breaker');
  }
}

/**
 * Obtiene el estado actual del circuit breaker
 */
export function getCircuitState(): CircuitState {
  return postgresCircuitBreaker.state;
}

/**
 * Resetea el circuit breaker manualmente (útil para testing o recuperación manual)
 */
export function resetCircuitBreaker(): void {
  const previousState = postgresCircuitBreaker.state;
  postgresCircuitBreaker.state = 'CLOSED';
  postgresCircuitBreaker.failureCount = 0;
  postgresCircuitBreaker.lastFailureTime = null;
  postgresCircuitBreaker.successCount = 0;
  logger.info('Circuit breaker: Reset manual', { previousState }, 'circuit-breaker');
}

/**
 * Obtiene información detallada del estado del circuit breaker
 */
export function getCircuitBreakerInfo(): {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  successCount: number;
  isOpen: boolean;
} {
  return {
    state: postgresCircuitBreaker.state,
    failureCount: postgresCircuitBreaker.failureCount,
    lastFailureTime: postgresCircuitBreaker.lastFailureTime,
    successCount: postgresCircuitBreaker.successCount,
    isOpen: isCircuitOpen(),
  };
}

/**
 * Wrapper para ejecutar operaciones con circuit breaker
 * @param operation - Operación a ejecutar
 * @param operationName - Nombre de la operación (para logging)
 * @param allowRetry - Si es true, permite un intento incluso si está OPEN (útil para operaciones críticas como login)
 * @returns Resultado de la operación
 */
export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  operationName: string = 'database operation',
  allowRetry: boolean = false
): Promise<T> {
  // Verificar si el circuito está abierto
  if (isCircuitOpen(allowRetry)) {
    const error = new Error(`Circuit breaker is OPEN. ${operationName} rejected. The database may be unavailable.`);
    logger.error('Circuit breaker: Operación rechazada', undefined, { 
      operationName, 
      state: postgresCircuitBreaker.state,
      allowRetry,
      timeSinceLastFailure: postgresCircuitBreaker.lastFailureTime 
        ? Date.now() - postgresCircuitBreaker.lastFailureTime 
        : null
    }, 'circuit-breaker');
    throw error;
  }
  
  try {
    const result = await operation();
    recordSuccess();
    return result;
  } catch (error) {
    recordFailure(error);
    throw error;
  }
}


