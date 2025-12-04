/**
 * =====================================================
 * SCRIPT: GENERAR MEMORIAS OPERATIVAS DEL AGENTE
 * =====================================================
 * Analiza queries frecuentes de los últimos 7 días
 * y genera memorias operativas sobre temas importantes.
 * 
 * Ejecutar: node scripts/generate-agent-memories.js
 * O configurar como cron job: 0 3 * * * (3 AM diario)
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'capital_plus_agent',
});

/**
 * Extrae tema de una consulta (simplificado)
 * En producción, podrías usar NLP más sofisticado
 */
function extractTopic(query) {
  const lowerQuery = query.toLowerCase();
  
  // Detectar temas comunes
  if (lowerQuery.includes('precio') || lowerQuery.includes('costo') || lowerQuery.includes('precio')) {
    return 'precios';
  }
  if (lowerQuery.includes('inventario') || lowerQuery.includes('disponible') || lowerQuery.includes('unidad')) {
    return 'inventario';
  }
  if (lowerQuery.includes('amenidad') || lowerQuery.includes('amenidades')) {
    return 'amenidades';
  }
  if (lowerQuery.includes('plano') || lowerQuery.includes('planta')) {
    return 'planos';
  }
  if (lowerQuery.includes('política') || lowerQuery.includes('proceso')) {
    return 'politicas';
  }
  
  // Extraer desarrollo mencionado
  const developments = ['campo magno', 'amura', 'm2', 'alya', 'c2b', 'c2a', 'd1a', '777', '111', 'fuego', 'hazul'];
  for (const dev of developments) {
    if (lowerQuery.includes(dev)) {
      return `${dev}_info`;
    }
  }
  
  // Tema genérico basado en palabras clave
  return 'general';
}

/**
 * Genera resumen de un tema basado en queries
 * En producción, podrías usar un LLM para generar resúmenes más inteligentes
 */
function generateSummary(topic, queries, responses) {
  // Resumen simple basado en patrones
  // En producción, esto debería usar un LLM para generar resúmenes más inteligentes
  
  if (topic.includes('precio')) {
    return `Los usuarios frecuentemente preguntan sobre precios. Es importante mencionar que los precios pueden variar y verificar siempre con el equipo de ventas.`;
  }
  
  if (topic.includes('inventario')) {
    return `Las consultas sobre inventario son frecuentes. Siempre verificar disponibilidad actual y estado de las unidades.`;
  }
  
  if (topic.includes('amenidad')) {
    return `Los usuarios preguntan frecuentemente sobre amenidades. Proporcionar lista completa y actualizada de amenidades disponibles.`;
  }
  
  // Resumen genérico
  const uniqueQueries = [...new Set(queries)].slice(0, 3);
  return `Tema frecuente identificado. Consultas comunes incluyen: "${uniqueQueries.join('", "')}". Proporcionar información precisa y actualizada.`;
}

async function generateAgentMemories() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando generación de memorias operativas...');
    
    // 1. Obtener queries frecuentes de los últimos 7 días
    const frequentQueriesResult = await client.query(`
      SELECT query, response, COUNT(*) as count
      FROM query_logs
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY query, response
      HAVING COUNT(*) >= 10
      ORDER BY count DESC
    `);
    
    console.log(`📊 Encontradas ${frequentQueriesResult.rows.length} consultas frecuentes`);
    
    if (frequentQueriesResult.rows.length === 0) {
      console.log('✅ No hay consultas frecuentes suficientes para generar memorias');
      return;
    }
    
    // 2. Agrupar por tema
    const topicsMap = new Map();
    
    for (const row of frequentQueriesResult.rows) {
      const topic = extractTopic(row.query);
      
      if (!topicsMap.has(topic)) {
        topicsMap.set(topic, {
          queries: [],
          responses: [],
          count: 0,
        });
      }
      
      const topicData = topicsMap.get(topic);
      topicData.queries.push(row.query);
      topicData.responses.push(row.response);
      topicData.count += parseInt(row.count);
    }
    
    console.log(`📋 Identificados ${topicsMap.size} temas únicos`);
    
    // 3. Generar memorias para cada tema
    let created = 0;
    let updated = 0;
    
    for (const [topic, data] of topicsMap.entries()) {
      // Calcular importancia basada en frecuencia
      const importance = Math.min(0.95, 0.5 + (data.count / 100)); // Máximo 0.95
      
      // Generar resumen
      const summary = generateSummary(topic, data.queries, data.responses);
      
      // Verificar si ya existe
      const existingResult = await client.query(
        `SELECT id FROM agent_memory WHERE topic = $1`,
        [topic]
      );
      
      if (existingResult.rows.length > 0) {
        // Actualizar memoria existente
        await client.query(
          `UPDATE agent_memory
           SET summary = $1,
               importance = (importance + $2) / 2,
               last_updated = NOW()
           WHERE topic = $3`,
          [summary, importance, topic]
        );
        updated++;
      } else {
        // Crear nueva memoria
        await client.query(
          `INSERT INTO agent_memory (topic, summary, importance, last_updated)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (topic) DO NOTHING`,
          [topic, summary, importance]
        );
        created++;
      }
      
      console.log(`   ✓ ${topic}: importancia ${importance.toFixed(2)}, ${data.count} consultas`);
    }
    
    console.log(`✅ Generación de memorias completada:`);
    console.log(`   - Memorias creadas: ${created}`);
    console.log(`   - Memorias actualizadas: ${updated}`);
    
  } catch (error) {
    console.error('❌ Error generando memorias:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  generateAgentMemories()
    .then(() => {
      console.log('✅ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en script:', error);
      process.exit(1);
    });
}

module.exports = { generateAgentMemories };

