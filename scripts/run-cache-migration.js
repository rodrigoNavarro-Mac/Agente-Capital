/**
 * =====================================================
 * SCRIPT PARA EJECUTAR MIGRACIÓN DE CACHÉ
 * =====================================================
 * Ejecuta la migración 003_query_cache.sql
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración de PostgreSQL desde variables de entorno
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'capital_plus_agent',
});

async function runCacheMigration() {
  const client = await pool.connect();
  
  try {
    console.log('📄 Ejecutando migración de caché (003_query_cache.sql)...\n');
    
    const migrationPath = path.join(__dirname, '..', 'migrations', '003_query_cache.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Archivo de migración no encontrado: ${migrationPath}`);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🚀 Ejecutando migración...');
    await client.query('BEGIN');
    
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migración de caché ejecutada exitosamente\n');
      
      // Verificar que la tabla se creó
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'query_cache'
      `);
      
      if (result.rows.length > 0) {
        console.log('✅ Tabla query_cache creada correctamente');
        
        // Mostrar estructura
        const columns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'query_cache'
          ORDER BY ordinal_position
        `);
        
        console.log('\n📊 Estructura de la tabla:');
        columns.rows.forEach(col => {
          console.log(`   - ${col.column_name} (${col.data_type})`);
        });
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error.code === '42P07') {
        console.log('ℹ️  La tabla query_cache ya existe, esto es normal si la migración ya se ejecutó antes');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error ejecutando migración:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar migración
runCacheMigration()
  .then(() => {
    console.log('\n✨ Proceso completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  });

