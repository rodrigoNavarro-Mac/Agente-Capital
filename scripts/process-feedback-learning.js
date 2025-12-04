/**
 * =====================================================
 * SCRIPT: PROCESAR FEEDBACK Y ACTUALIZAR APRENDIZAJE
 * =====================================================
 * Job nocturno que procesa feedback de las últimas 24 horas
 * y actualiza la tabla response_learning con respuestas aprendidas.
 * 
 * Ejecutar: node scripts/process-feedback-learning.js
 * O configurar como cron job: 0 2 * * * (2 AM diario)
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
 * Normaliza una consulta para agrupar variaciones similares
 */
function normalizeQuery(query) {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Normalizar espacios
    .replace(/[¿?¡!.,;:]/g, ''); // Remover puntuación
}

/**
 * Convierte rating (1-5) a score de calidad (-1 a +1)
 */
function ratingToQualityScore(rating) {
  // Convierte 1-5 a -1 a +1
  // 1 -> -1, 2 -> -0.5, 3 -> 0, 4 -> 0.5, 5 -> 1
  return (rating - 3) / 2;
}

async function processFeedbackLearning() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando procesamiento de feedback para aprendizaje...');
    
    // 1. Obtener feedback de las últimas 24 horas
    const feedbackResult = await client.query(`
      SELECT id, query, response, feedback_rating
      FROM query_logs
      WHERE feedback_rating IS NOT NULL
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Encontrados ${feedbackResult.rows.length} registros con feedback`);
    
    if (feedbackResult.rows.length === 0) {
      console.log('✅ No hay feedback nuevo para procesar');
      return;
    }
    
    // 2. Procesar cada feedback
    let processed = 0;
    let updated = 0;
    let created = 0;
    
    for (const row of feedbackResult.rows) {
      const normalizedQuery = normalizeQuery(row.query);
      const qualityScore = ratingToQualityScore(row.feedback_rating);
      
      // Verificar si ya existe una respuesta aprendida para esta consulta
      const existingResult = await client.query(
        `SELECT id, quality_score, usage_count 
         FROM response_learning 
         WHERE query = $1`,
        [normalizedQuery]
      );
      
      if (existingResult.rows.length > 0) {
        // Actualizar respuesta existente
        const existing = existingResult.rows[0];
        const newQualityScore = (existing.quality_score * existing.usage_count + qualityScore) / (existing.usage_count + 1);
        
        await client.query(
          `UPDATE response_learning
           SET quality_score = $1,
               usage_count = usage_count + 1,
               last_improved_at = NOW()
           WHERE id = $2`,
          [newQualityScore, existing.id]
        );
        
        updated++;
      } else {
        // Crear nueva respuesta aprendida
        await client.query(
          `INSERT INTO response_learning (query, answer, quality_score, usage_count, last_improved_at)
           VALUES ($1, $2, $3, 1, NOW())
           ON CONFLICT (query) DO NOTHING`,
          [normalizedQuery, row.response, qualityScore]
        );
        
        created++;
      }
      
      processed++;
    }
    
    console.log(`✅ Procesamiento completado:`);
    console.log(`   - Total procesados: ${processed}`);
    console.log(`   - Respuestas actualizadas: ${updated}`);
    console.log(`   - Respuestas nuevas: ${created}`);
    
  } catch (error) {
    console.error('❌ Error procesando feedback:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  processFeedbackLearning()
    .then(() => {
      console.log('✅ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en script:', error);
      process.exit(1);
    });
}

module.exports = { processFeedbackLearning };

