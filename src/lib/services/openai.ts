/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - OPENAI CLIENT
 * =====================================================
 * Cliente para comunicarse con la API de OpenAI.
 * Envía prompts al modelo LLM y procesa las respuestas.
 */

import OpenAI from 'openai';
import { withTimeout, TIMEOUTS } from '@/lib/utils/timeout';
import type { LMStudioMessage } from '@/types/documents';
import { logger } from '@/lib/utils/logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2048;

// Inicializar cliente de OpenAI
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no está configurada en las variables de entorno');
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * Ejecuta una consulta al LLM de OpenAI
 * 
 * @param messages - Array de mensajes (system, user, assistant)
 * @param options - Opciones adicionales (temperature, max_tokens, model)
 * @returns Respuesta del LLM
 */
export async function runLLM(
  messages: LMStudioMessage[],
  options: {
    temperature?: number;
    max_tokens?: number;
    model?: string;
  } = {}
): Promise<string> {
  const {
    temperature = DEFAULT_TEMPERATURE,
    max_tokens = DEFAULT_MAX_TOKENS,
    model = OPENAI_MODEL,
  } = options;

  try {
    logger.debug(`Enviando consulta a OpenAI (modelo: ${model})...`, {}, 'openai');
    
    const client = getOpenAIClient();
    
    // Convertir mensajes al formato de OpenAI
    const openaiMessages = messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    // Aplicar timeout a la llamada a OpenAI
    const response = await withTimeout(
      client.chat.completions.create({
        model,
        messages: openaiMessages,
        temperature,
        max_tokens,
      }),
      TIMEOUTS.LLM_REQUEST,
      `Llamada a OpenAI (modelo: ${model}) excedió el tiempo límite`
    );

    // Extraer el contenido de la respuesta
    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      logger.error('La respuesta no tiene contenido. Estructura recibida', undefined, {
        hasChoices: !!response.choices,
        choicesLength: response.choices?.length,
        firstChoice: response.choices?.[0],
      }, 'openai');
      throw new Error('La respuesta de OpenAI no contiene contenido');
    }

    // Log de tokens utilizados si está disponible
    if (response.usage) {
      logger.debug('Tokens utilizados', { prompt: response.usage.prompt_tokens, completion: response.usage.completion_tokens, total: response.usage.total_tokens }, 'openai');
    }

    logger.debug('Respuesta de OpenAI recibida', { content, usage: response.usage ?? undefined }, 'openai');
    return content;
  } catch (error) {
    logger.error('Error en runLLM (OpenAI)', error, {}, 'openai');
    throw error;
  }
}

/**
 * Verifica si OpenAI está disponible y configurado correctamente
 * @returns true si OpenAI está disponible, false si no
 */
export async function checkOpenAIHealth(): Promise<boolean> {
  try {
    if (!OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY no está configurada', {}, 'openai');
      return false;
    }

    const client = getOpenAIClient();
    
    // Hacer una llamada simple para verificar que la API funciona
    await client.models.list();
    
    logger.debug('OpenAI está disponible.', {}, 'openai');
    return true;
  } catch (error) {
    logger.error('OpenAI no está disponible', error, {}, 'openai');
    return false;
  }
}

/**
 * Obtiene la lista de modelos disponibles en OpenAI
 * @returns Lista de modelos
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const client = getOpenAIClient();
    const response = await client.models.list();
    
    // Filtrar solo modelos de chat
    const chatModels = response.data
      .filter(model => model.id.includes('gpt'))
      .map(model => model.id);
    
    return chatModels;
  } catch (error) {
    logger.error('Error obteniendo modelos de OpenAI', error, {}, 'openai');
    throw error;
  }
}

export default {
  runLLM,
  checkOpenAIHealth,
  getAvailableModels,
};



