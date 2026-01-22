/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - LIB INDEX
 * =====================================================
 * Exporta todas las utilidades del sistema.
 */

// Clientes de servicios externos
export * from './db/pinecone';
export * from './services/llm';
export * from './db/postgres';

// Utilidades de procesamiento de texto
export * from './utils/chunker';
export * from './utils/cleanText';

// System Prompt
export * from './config/systemPrompt';
