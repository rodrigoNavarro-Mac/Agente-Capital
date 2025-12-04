/**
 * =====================================================
 * SCRIPT: RE-INDEXACIÓN DE CHUNKS PROBLEMÁTICOS
 * =====================================================
 * Identifica chunks con bajo desempeño o sin uso reciente
 * y los marca para re-indexación.
 * 
 * NOTA: Este script identifica chunks problemáticos pero NO los re-indexa
 * automáticamente. Requiere intervención manual o integración con el sistema
 * de procesamiento de documentos.
 * 
 * Ejecutar: node scripts/reindex-problematic-chunks.js
 * O configurar como cron job: 0 4 1 * * (4 AM el día 1 de cada mes)
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

async function identifyProblematicChunks() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando identificación de chunks problemáticos...');
    
    // 1. Obtener chunks con bajo desempeño
    // Chunks donde fail_count > success_count * 3
    const lowPerformanceResult = await client.query(`
      SELECT chunk_id, success_count, fail_count, last_used
      FROM chunk_stats
      WHERE fail_count > success_count * 3
        AND (success_count + fail_count) >= 3  -- Al menos 3 usos para tener datos significativos
      ORDER BY fail_count DESC, last_used ASC
    `);
    
    console.log(`📊 Chunks con bajo desempeño: ${lowPerformanceResult.rows.length}`);
    
    // 2. Obtener chunks sin uso reciente (más de 60 días)
    const unusedResult = await client.query(`
      SELECT chunk_id, success_count, fail_count, last_used
      FROM chunk_stats
      WHERE last_used < NOW() - INTERVAL '60 days'
      ORDER BY last_used ASC
    `);
    
    console.log(`📊 Chunks sin uso reciente: ${unusedResult.rows.length}`);
    
    // 3. Combinar resultados
    const problematicChunks = new Set();
    
    for (const row of lowPerformanceResult.rows) {
      problematicChunks.add(row.chunk_id);
    }
    
    for (const row of unusedResult.rows) {
      problematicChunks.add(row.chunk_id);
    }
    
    console.log(`📋 Total de chunks problemáticos únicos: ${problematicChunks.size}`);
    
    if (problematicChunks.size === 0) {
      console.log('✅ No se encontraron chunks problemáticos');
      return;
    }
    
    // 4. Mostrar resumen
    console.log('\n📝 RESUMEN DE CHUNKS PROBLEMÁTICOS:');
    console.log('='.repeat(60));
    
    // Chunks con bajo desempeño
    if (lowPerformanceResult.rows.length > 0) {
      console.log('\n🔴 Chunks con bajo desempeño (fail_count > success_count * 3):');
      for (const row of lowPerformanceResult.rows.slice(0, 10)) {
        const successRatio = row.success_count / (row.success_count + row.fail_count);
        console.log(`   - ${row.chunk_id}: ${row.success_count} éxitos, ${row.fail_count} fallos (ratio: ${(successRatio * 100).toFixed(1)}%)`);
      }
      if (lowPerformanceResult.rows.length > 10) {
        console.log(`   ... y ${lowPerformanceResult.rows.length - 10} más`);
      }
    }
    
    // Chunks sin uso
    if (unusedResult.rows.length > 0) {
      console.log('\n⏰ Chunks sin uso reciente (>60 días):');
      for (const row of unusedResult.rows.slice(0, 10)) {
        const daysSinceUse = Math.floor((Date.now() - new Date(row.last_used).getTime()) / (1000 * 60 * 60 * 24));
        console.log(`   - ${row.chunk_id}: último uso hace ${daysSinceUse} días`);
      }
      if (unusedResult.rows.length > 10) {
        console.log(`   ... y ${unusedResult.rows.length - 10} más`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n💡 ACCIONES RECOMENDADAS:');
    console.log('   1. Revisar los chunks identificados');
    console.log('   2. Verificar si el contenido está desactualizado');
    console.log('   3. Reprocesar documentos fuente si es necesario');
    console.log('   4. Re-indexar chunks después de correcciones');
    console.log('\n⚠️  NOTA: Este script solo identifica chunks problemáticos.');
    console.log('   La re-indexación debe hacerse manualmente o mediante el sistema de procesamiento.');
    
  } catch (error) {
    console.error('❌ Error identificando chunks problemáticos:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  identifyProblematicChunks()
    .then(() => {
      console.log('\n✅ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en script:', error);
      process.exit(1);
    });
}

module.exports = { identifyProblematicChunks };

