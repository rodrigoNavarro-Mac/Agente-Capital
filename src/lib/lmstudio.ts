/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LM STUDIO CLIENT
 * =====================================================
 * Cliente para comunicarse con el servidor local de LM Studio.
 * Envía prompts al modelo LLM y procesa las respuestas.
 */

import type { 
  LMStudioMessage, 
  LMStudioRequest, 
  LMStudioResponse 
} from '@/types/documents';
import { getSystemPrompt, NO_CONTEXT_RESPONSE } from './systemPrompt';
import { fetchWithTimeout, TIMEOUTS } from '@/lib/timeout';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const LMSTUDIO_BASE_URL = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || 'llama-3.2-3b-instruct';
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2048;

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * Ejecuta una consulta al LLM de LM Studio
 * 
 * @param messages - Array de mensajes (system, user, assistant)
 * @param options - Opciones adicionales (temperature, max_tokens)
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
    model = LMSTUDIO_MODEL,
  } = options;

  const requestBody: LMStudioRequest = {
    model,
    messages,
    temperature,
    max_tokens,
    stream: false,
  };

  try {
    console.log(`🤖 Enviando consulta a LM Studio (modelo: ${model})...`);
    
    // Aplicar timeout a la llamada a LM Studio
    const response = await fetchWithTimeout(
      `${LMSTUDIO_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      TIMEOUTS.LLM_REQUEST
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio error (${response.status}): ${errorText}`);
    }

    const data: LMStudioResponse = await response.json();

    // Debug: Ver la respuesta completa
    console.log('🔍 Respuesta de LM Studio:', JSON.stringify(data, null, 2));

    // Extraer el contenido de la respuesta
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('❌ La respuesta no tiene contenido. Estructura recibida:', {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        firstChoice: data.choices?.[0],
      });
      throw new Error('La respuesta de LM Studio no contiene contenido');
    }

    // Log de tokens utilizados si está disponible
    if (data.usage) {
      console.log(`📊 Tokens: prompt=${data.usage.prompt_tokens}, completion=${data.usage.completion_tokens}, total=${data.usage.total_tokens}`);
    }

    console.log('✅ Respuesta de LM Studio recibida');
    return content;
  } catch (error) {
    console.error('❌ Error en runLLM:', error);
    throw error;
  }
}

/**
 * Ejecuta una consulta RAG completa
 * Combina el contexto recuperado con la pregunta del usuario
 * 
 * @param query - Pregunta del usuario
 * @param context - Contexto recuperado de Pinecone
 * @param queryType - Tipo de consulta para ajustar el prompt
 * @returns Respuesta del LLM
 */
export async function runRAGQuery(
  query: string,
  context: string,
  queryType?: string,
  memories?: Array<{ topic: string; summary: string; importance: number }>
): Promise<string> {
  // Si no hay contexto, usar respuesta predeterminada
  if (!context || context.trim() === '') {
    console.log('⚠️ No se encontró contexto relevante');
    return NO_CONTEXT_RESPONSE;
  }

  // Obtener el system prompt apropiado con memorias
  const systemPrompt = await getSystemPrompt(queryType, memories);

  // Construir el mensaje del usuario con el contexto
  const userMessage = `Pregunta: ${query}

Contexto recuperado de la base de conocimientos:
${context}

**INSTRUCCIONES IMPORTANTES SOBRE CITAS:**
- Cada fuente en el contexto está numerada como "Fuente 1", "Fuente 2", etc.
- Cuando uses información de una fuente, DEBES incluir una cita numérica al final de la oración o frase en formato [1], [2], [3], etc.
- El número de la cita corresponde al número de la fuente (Fuente 1 = [1], Fuente 2 = [2], etc.).
- Si usas información de múltiples fuentes en la misma oración, incluye todas las citas: [1][2].
- Ejemplo: "El precio es de $2,500,000 MXN [1] y está disponible en la zona norte [2]."

Por favor, responde la pregunta basándote en el contexto proporcionado. Si el contexto no contiene suficiente información para responder completamente, indícalo.`;

  const messages: LMStudioMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await runLLM(messages);
    return response;
  } catch (error) {
    console.error('❌ Error en runRAGQuery:', error);
    throw error;
  }
}

/**
 * Verifica si el servidor LM Studio está disponible
 * @returns true si el servidor responde, false si no
 */
export async function checkLMStudioHealth(): Promise<boolean> {
  try {
    // Intentar conexión básica primero
    const response = await fetch(`${LMSTUDIO_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`🔍 LM Studio health check: Status ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ LM Studio está disponible.');
      
      // Verificar si hay modelos disponibles
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        console.log(`📋 Modelos cargados (${data.data.length}):`, data.data.map((m: any) => m.id));
      } else {
        console.warn('⚠️ LM Studio está corriendo pero NO hay modelos cargados');
      }
      
      return true;
    }

    console.warn(`⚠️ LM Studio respondió con status ${response.status}`);
    return false;
  } catch (error) {
    console.error('❌ LM Studio no está disponible:', error);
    console.log(`💡 Verifica que LM Studio esté corriendo en ${LMSTUDIO_BASE_URL}`);
    return false;
  }
}

/**
 * Obtiene la lista de modelos disponibles en LM Studio
 * @returns Lista de modelos
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${LMSTUDIO_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error obteniendo modelos: ${response.status}`);
    }

    const data = await response.json();
    const models = data.data?.map((m: { id: string }) => m.id) || [];
    
    return models;
  } catch (error) {
    console.error('❌ Error obteniendo modelos:', error);
    throw error;
  }
}

/**
 * Ejecuta una consulta simple sin contexto RAG
 * Útil para saludos, preguntas generales o consultas que no requieren documentos
 * 
 * @param query - Pregunta del usuario
 * @returns Respuesta del LLM
 */
export async function runSimpleQuery(query: string): Promise<string> {
  const systemPrompt = `Eres un asistente virtual de Capital Plus, una empresa inmobiliaria mexicana.

Tu función es ayudar a los usuarios con información sobre desarrollos inmobiliarios, pero para consultas simples como saludos, puedes responder de manera amigable y directa.

Para consultas sobre desarrollos específicos, precios, amenidades, inventario, etc., el usuario deberá hacer una pregunta más detallada que requiera buscar en los documentos.

Responde de manera:
- Concisa y profesional
- Amigable y acogedora
- En español
- Sin inventar información que no conoces

Si es un saludo, saluda de vuelta y ofrece tu ayuda.`;

  const messages: LMStudioMessage[] = [
    { 
      role: 'system', 
      content: systemPrompt
    },
    { role: 'user', content: query },
  ];

  return runLLM(messages, {
    temperature: 0.7, // Un poco más creativo para saludos
    max_tokens: 150,  // Respuestas más cortas para consultas simples
  });
}

/**
 * Genera un resumen de un texto largo
 * @param text - Texto a resumir
 * @param maxLength - Longitud máxima del resumen (en palabras aproximadas)
 * @returns Resumen del texto
 */
export async function summarizeText(
  text: string, 
  maxLength: number = 200
): Promise<string> {
  const messages: LMStudioMessage[] = [
    { 
      role: 'system', 
      content: `Eres un experto en resumir documentos. Genera resúmenes claros y concisos de aproximadamente ${maxLength} palabras.` 
    },
    { 
      role: 'user', 
      content: `Por favor, resume el siguiente texto:\n\n${text}` 
    },
  ];

  return runLLM(messages, { temperature: 0.3 });
}

// =====================================================
// STREAMING SUPPORT (Para futuras implementaciones)
// =====================================================

/**
 * Ejecuta una consulta con streaming de respuesta
 * Nota: Requiere implementación adicional del lado del cliente
 * 
 * @param messages - Array de mensajes
 * @param onChunk - Callback para cada chunk de texto
 */
export async function runLLMStream(
  messages: LMStudioMessage[],
  onChunk: (chunk: string) => void
): Promise<void> {
  const requestBody: LMStudioRequest = {
    model: LMSTUDIO_MODEL,
    messages,
    temperature: DEFAULT_TEMPERATURE,
    stream: true,
  };

  try {
    // Aplicar timeout a la llamada streaming a LM Studio
    const response = await fetchWithTimeout(
      `${LMSTUDIO_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      TIMEOUTS.LLM_STREAM
    );

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No se pudo obtener el reader del stream');
    }

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              onChunk(content);
            }
          } catch {
            // Ignorar líneas que no son JSON válido
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error en runLLMStream:', error);
    throw error;
  }
}

export default {
  runLLM,
  runRAGQuery,
  checkLMStudioHealth,
  getAvailableModels,
  runSimpleQuery,
  summarizeText,
  runLLMStream,
};

