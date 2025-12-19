/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LLM PROVIDER ABSTRACTION
 * =====================================================
 * Capa de abstracción que permite cambiar entre diferentes
 * proveedores de LLM (LM Studio, OpenAI, etc.)
 */

import { runLLM as runLLMLMStudio, checkLMStudioHealth, getAvailableModels as getLMStudioModels } from './lmstudio';
import { runLLM as runLLMOpenAI, checkOpenAIHealth, getAvailableModels as getOpenAIModels } from './openai';
import { getConfig } from './postgres';
import type { LMStudioMessage } from '@/types/documents';
import { logger } from '@/lib/logger';

// =====================================================
// TIPOS
// =====================================================

export type LLMProvider = 'lmstudio' | 'openai';

export interface LLMOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

// =====================================================
// CONFIGURACIÓN
// =====================================================

const DEFAULT_PROVIDER: LLMProvider = 'lmstudio';

// =====================================================
// FUNCIONES PRINCIPALES
// =====================================================

/**
 * Obtiene el proveedor LLM configurado desde la base de datos
 * @returns El proveedor configurado o el por defecto
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  try {
    const provider = await getConfig('llm_provider');
    if (provider && (provider === 'lmstudio' || provider === 'openai')) {
      return provider as LLMProvider;
    }
    return DEFAULT_PROVIDER;
  } catch (error) {
    logger.error('Error obteniendo proveedor LLM, usando por defecto', error, {}, 'llm-provider');
    return DEFAULT_PROVIDER;
  }
}

/**
 * Ejecuta una consulta al LLM usando el proveedor configurado
 * 
 * @param messages - Array de mensajes (system, user, assistant)
 * @param options - Opciones adicionales (temperature, max_tokens, model)
 * @returns Respuesta del LLM
 */
export async function runLLM(
  messages: LMStudioMessage[],
  options: LLMOptions = {}
): Promise<string> {
  const provider = await getLLMProvider();
  
  logger.info(`Usando proveedor LLM: ${provider}`, {}, 'llm-provider');
  
  switch (provider) {
    case 'openai':
      return runLLMOpenAI(messages, options);
    case 'lmstudio':
    default:
      return runLLMLMStudio(messages, options);
  }
}

/**
 * Verifica si el proveedor LLM configurado está disponible
 * @returns true si está disponible, false si no
 */
export async function checkLLMHealth(): Promise<boolean> {
  const provider = await getLLMProvider();
  
  logger.info(`Verificando salud del proveedor LLM: ${provider}`, {}, 'llm-provider');
  
  switch (provider) {
    case 'openai':
      return checkOpenAIHealth();
    case 'lmstudio':
    default:
      return checkLMStudioHealth();
  }
}

/**
 * Obtiene la lista de modelos disponibles según el proveedor configurado
 * @returns Lista de modelos disponibles
 */
export async function getAvailableModels(): Promise<string[]> {
  const provider = await getLLMProvider();
  
  try {
    switch (provider) {
      case 'openai':
        return getOpenAIModels();
      case 'lmstudio':
      default:
        return getLMStudioModels();
    }
  } catch (error) {
    logger.error(`Error obteniendo modelos del proveedor ${provider}`, error, {}, 'llm-provider');
    return [];
  }
}

/**
 * Verifica la salud de todos los proveedores disponibles
 * @returns Objeto con el estado de cada proveedor
 */
export async function checkAllProvidersHealth(): Promise<{
  lmstudio: boolean;
  openai: boolean;
  current: LLMProvider;
}> {
  const [lmstudio, openai, current] = await Promise.all([
    checkLMStudioHealth(),
    checkOpenAIHealth(),
    getLLMProvider(),
  ]);

  return {
    lmstudio,
    openai,
    current,
  };
}

export default {
  runLLM,
  checkLLMHealth,
  getAvailableModels,
  getLLMProvider,
  checkAllProvidersHealth,
};

