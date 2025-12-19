/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LLM CLIENT (ABSTRACCIÓN)
 * =====================================================
 * Cliente de alto nivel para LLM que usa el proveedor configurado.
 * Soporta múltiples proveedores: LM Studio, OpenAI, etc.
 */

import type { LMStudioMessage } from '@/types/documents';
import type { PineconeMatch } from '@/types/documents';
import { getSystemPrompt, NO_CONTEXT_RESPONSE } from './systemPrompt';
import { runLLM as runLLMProvider, checkLLMHealth, checkAllProvidersHealth } from './llm-provider';
import { validateResponseAgainstChunks } from './responseValidator';
import { logger } from '@/lib/logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2048;

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * Ejecuta una consulta al LLM usando el proveedor configurado
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
    model,
  } = options;

  return runLLMProvider(messages, {
    temperature,
    max_tokens,
    model,
  });
}

/**
 * Ejecuta una consulta RAG completa
 * Combina el contexto recuperado con la pregunta del usuario
 * 
 * @param query - Pregunta del usuario
 * @param context - Contexto recuperado de Pinecone
 * @param queryType - Tipo de consulta para ajustar el prompt
 * @param memories - Memorias operativas del agente
 * @param matches - Chunks recuperados para validación (opcional)
 * @returns Respuesta del LLM validada contra los chunks
 */
export async function runRAGQuery(
  query: string,
  context: string,
  queryType?: string,
  memories?: Array<{ topic: string; summary: string; importance: number }>,
  matches?: PineconeMatch[]
): Promise<string> {
  // Si no hay contexto, usar respuesta predeterminada
  if (!context || context.trim() === '') {
    logger.warn('No se encontró contexto relevante', {}, 'llm');
    return NO_CONTEXT_RESPONSE;
  }

  // Obtener el system prompt apropiado con memorias
  const systemPrompt = await getSystemPrompt(queryType, memories);

  // Construir el mensaje del usuario con el contexto
  const userMessage = `Pregunta: ${query}

Contexto recuperado de la base de conocimientos:
${context}

**INSTRUCCIONES CRÍTICAS SOBRE EL USO DE INFORMACIÓN:**

1. **SOLO usa información que esté explícitamente en el contexto proporcionado arriba**
   - NO inventes, supongas o agregues información que no esté en las fuentes
   - NO uses conocimiento general que no esté en el contexto
   - Si el contexto no contiene la información necesaria, di claramente "No encontré esta información en los documentos proporcionados"

2. **CITAS OBLIGATORIAS:**
   - Cada fuente en el contexto está numerada como "Fuente 1", "Fuente 2", etc.
   - Cuando uses información de una fuente, DEBES incluir una cita numérica al final de la oración o frase en formato [1], [2], [3], etc.
   - El número de la cita corresponde al número de la fuente (Fuente 1 = [1], Fuente 2 = [2], etc.).
   - Si usas información de múltiples fuentes en la misma oración, incluye todas las citas: [1][2].
   - Ejemplo: "El precio es de $2,500,000 MXN [1] y está disponible en la zona norte [2]."

3. **REGLAS ESTRICTAS:**
   - TODA información específica (precios, nombres, números, fechas, características) DEBE tener una cita
   - Si mencionas un dato que no está en el contexto, NO lo incluyas en tu respuesta
   - Si no estás 100% seguro de que la información está en el contexto, NO la uses
   - Es mejor decir "No encontré esta información" que inventar o suponer

4. **FORMATO:**
   - Usa formato Markdown para estructurar tu respuesta
   - Incluye citas para cada afirmación que uses del contexto
   - Si el contexto no tiene suficiente información, indícalo claramente

Por favor, responde la pregunta basándote ÚNICAMENTE en el contexto proporcionado. Si el contexto no contiene suficiente información para responder completamente, indícalo explícitamente.`;

  const messages: LMStudioMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await runLLM(messages);
    
    // Validar la respuesta contra los chunks si están disponibles
    if (matches && matches.length > 0) {
      const validation = validateResponseAgainstChunks(response, matches);
      
      // Log de advertencias si las hay
      if (validation.warnings.length > 0) {
        logger.warn('Advertencias de validación', { warnings: validation.warnings }, 'llm');
      }
      
      // Si hay afirmaciones sin citas, loguearlas
      if (validation.uncitedClaims.length > 0) {
        logger.warn(
          `Se encontraron ${validation.uncitedClaims.length} afirmación(es) sin citas`,
          { claims: validation.uncitedClaims.slice(0, 3).map((claim) => claim.substring(0, 200)) },
          'llm'
        );
      }
      
      // Usar la respuesta filtrada
      if (!validation.isValid && validation.warnings.length > 0) {
        logger.warn(
          'La respuesta contiene información que puede no estar respaldada por los chunks',
          {},
          'llm'
        );
      }
      
      return validation.filteredResponse;
    }
    
    return response;
  } catch (error) {
    logger.error('Error en runRAGQuery', error, {}, 'llm');
    throw error;
  }
}

/**
 * Verifica si el proveedor LLM configurado está disponible
 * @returns true si está disponible, false si no
 */
export async function checkLMStudioHealth(): Promise<boolean> {
  // Mantener compatibilidad con el nombre anterior, pero usar el proveedor configurado
  return checkLLMHealth();
}

/**
 * Obtiene el estado de salud de todos los proveedores
 * @returns Objeto con el estado de cada proveedor
 */
export async function getAllProvidersHealth() {
  return checkAllProvidersHealth();
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

**IMPORTANTE**: Siempre usa formato Markdown para estructurar tus respuestas. El sistema interpretará y mostrará el markdown correctamente formateado.

Responde de manera:
- Concisa y profesional
- Amigable y acogedora
- En español
- Sin inventar información que no conoces
- **Usando markdown** para mejorar la legibilidad (negritas, listas, etc.)

Si es un saludo, saluda de vuelta y ofrece tu ayuda usando formato markdown.`;

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

// Nota: runLLMStream requiere implementación específica por proveedor
// Por ahora, se mantiene solo en lmstudio.ts para compatibilidad

export default {
  runLLM,
  runRAGQuery,
  checkLMStudioHealth,
  runSimpleQuery,
  summarizeText,
  getAllProvidersHealth,
};

