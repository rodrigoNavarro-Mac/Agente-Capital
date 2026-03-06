import { runLLM } from '@/lib/services/llm';

const TRIGGER_WORDS = [
  'hijo', 'familia', 'patrimonio', 'retiro',
  'invertir', 'casar', 'construir casa',
];

function hasEmotionalSignal(message: string): boolean {
  const lower = message.toLowerCase();
  return TRIGGER_WORDS.some(word => lower.includes(word));
}

const SYSTEM_PROMPT = `Eres un asistente de ventas inmobiliario empático.
El usuario compartió algo personal. Escribe EXACTAMENTE 1 o 2 frases cortas en español
que reconozcan emocionalmente lo que dijo.
REGLAS ESTRICTAS:
- Solo el prefacio empático, sin saludo, sin cierre, sin puntos al final de la última frase
- No más de 2 frases
- No repitas el mensaje base
- No uses emojis
- Termina con un punto`;

export async function personalizeResponse(
  userMessage: string,
  baseMessage: string,
): Promise<string> {
  if (!hasEmotionalSignal(userMessage)) {
    return baseMessage;
  }

  try {
    const prefix = await runLLM(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.7, max_tokens: 80 },
    );

    const cleanPrefix = prefix.trim();
    if (!cleanPrefix) return baseMessage;
    return `${cleanPrefix}\n\n${baseMessage}`;
  } catch {
    // Si el LLM falla, retornar el mensaje base sin cambios
    return baseMessage;
  }
}
