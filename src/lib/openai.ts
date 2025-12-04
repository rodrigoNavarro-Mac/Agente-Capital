/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - OPENAI CLIENT
 * =====================================================
 * Cliente para comunicarse con la API de OpenAI.
 * Envía prompts al modelo LLM y procesa las respuestas.
 */

import OpenAI from 'openai';
import type { LMStudioMessage } from '@/types/documents';

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
    console.log(`🤖 Enviando consulta a OpenAI (modelo: ${model})...`);
    
    const client = getOpenAIClient();
    
    // Convertir mensajes al formato de OpenAI
    const openaiMessages = messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    const response = await client.chat.completions.create({
      model,
      messages: openaiMessages,
      temperature,
      max_tokens,
    });

    // Extraer el contenido de la respuesta
    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      console.error('❌ La respuesta no tiene contenido. Estructura recibida:', {
        hasChoices: !!response.choices,
        choicesLength: response.choices?.length,
        firstChoice: response.choices?.[0],
      });
      throw new Error('La respuesta de OpenAI no contiene contenido');
    }

    // Log de tokens utilizados si está disponible
    if (response.usage) {
      console.log(`📊 Tokens: prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}, total=${response.usage.total_tokens}`);
    }

    console.log('✅ Respuesta de OpenAI recibida');
    return content;
  } catch (error) {
    console.error('❌ Error en runLLM (OpenAI):', error);
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
      console.warn('⚠️ OPENAI_API_KEY no está configurada');
      return false;
    }

    const client = getOpenAIClient();
    
    // Hacer una llamada simple para verificar que la API funciona
    await client.models.list();
    
    console.log('✅ OpenAI está disponible.');
    return true;
  } catch (error) {
    console.error('❌ OpenAI no está disponible:', error);
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
    console.error('❌ Error obteniendo modelos de OpenAI:', error);
    throw error;
  }
}

export default {
  runLLM,
  checkOpenAIHealth,
  getAvailableModels,
};

