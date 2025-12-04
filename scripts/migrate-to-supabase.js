/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - MIGRACIÓN A SUPABASE
 * =====================================================
 * Script para migrar datos de una base de datos local
 * a Supabase.
 * 
 * Este script:
 * 1. Conecta a la base de datos local (origen)
 * 2. Conecta a Supabase (destino)
 * 3. Copia todas las tablas y datos
 * 4. Mantiene las relaciones y secuencias
 * 
 * Uso:
 *   node scripts/migrate-to-supabase.js
 * 
 * Requisitos:
 *   - Tener DATABASE_URL configurada en .env para Supabase
 *   - Tener las variables POSTGRES_* configuradas para la BD local
 *   - Haber ejecutado las migraciones en Supabase primero
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// =====================================================
// CONFIGURACIÓN DE CONEXIONES
// =====================================================

function getLocalPoolConfig() {
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'capital_plus_agent',
  };
}

function getSupabasePoolConfig() {
  if (!process.env.DATABASE_URL) {
    throw new Error('❌ DATABASE_URL no está configurada en .env');
  }

  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  };
}

const localPool = new Pool(getLocalPoolConfig());
const supabasePool = new Pool(getSupabasePoolConfig());

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Obtiene todas las tablas de la base de datos
 */
async function getTables(pool) {
  const result = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map(row => row.table_name);
}

/**
 * Obtiene el orden correcto de las tablas según sus dependencias
 */
function getTableOrder() {
  // Orden basado en dependencias (tablas sin FK primero)
  return [
    'roles',
    'permissions',
    'users',
    'role_permissions',
    'user_developments',
    'documents_meta',
    'agent_config',
    'query_cache',
    'query_logs',
    'query_logs_chunks',
    'chunk_stats',
    'response_learning',
    'agent_memory',
    'action_logs',
    'user_sessions',
    'password_reset_tokens',
  ];
}

/**
 * Copia datos de una tabla de origen a destino
 */
async function copyTableData(sourcePool, destPool, tableName) {
  console.log(`📋 Copiando tabla: ${tableName}...`);

  try {
    // Obtener todos los datos de la tabla origen
    const sourceData = await sourcePool.query(`SELECT * FROM ${tableName}`);
    
    if (sourceData.rows.length === 0) {
      console.log(`   ⚠️  Tabla ${tableName} está vacía, saltando...`);
      return 0;
    }

    // Obtener nombres de columnas
    const columns = Object.keys(sourceData.rows[0]);
    
    // Construir query de inserción
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const columnNames = columns.join(', ');
    const insertQuery = `
      INSERT INTO ${tableName} (${columnNames})
      VALUES (${placeholders})
      ON CONFLICT DO NOTHING
    `;

    // Insertar datos en lotes para mejor rendimiento
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < sourceData.rows.length; i += batchSize) {
      const batch = sourceData.rows.slice(i, i + batchSize);
      
      // Usar transacción para cada lote
      const client = await destPool.connect();
      try {
        await client.query('BEGIN');
        
        for (const row of batch) {
          const values = columns.map(col => row[col]);
          const result = await client.query(insertQuery, values);
          if (result.rowCount > 0) {
            inserted++;
          }
        }
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`   ✅ ${inserted} filas copiadas a ${tableName}`);
    return inserted;
  } catch (error) {
    console.error(`   ❌ Error copiando ${tableName}:`, error.message);
    throw error;
  }
}

/**
 * Resetea las secuencias de las tablas
 */
async function resetSequences(pool) {
  console.log('🔄 Reseteando secuencias...');
  
  const tables = await getTables(pool);
  
  for (const table of tables) {
    try {
      // Obtener columnas con secuencias
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
        AND column_default LIKE 'nextval%'
      `, [table]);
      
      for (const col of result.rows) {
        const seqName = `${table}_${col.column_name}_seq`;
        await pool.query(`
          SELECT setval('${seqName}', COALESCE((SELECT MAX(${col.column_name}) FROM ${table}), 1), true)
        `);
      }
    } catch (error) {
      // Si la secuencia no existe, continuar
      if (!error.message.includes('does not exist')) {
        console.warn(`   ⚠️  Error reseteando secuencias de ${table}:`, error.message);
      }
    }
  }
  
  console.log('   ✅ Secuencias reseteadas');
}

// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================

async function migrate() {
  console.log('🚀 Iniciando migración a Supabase...\n');

  try {
    // Verificar conexiones
    console.log('🔌 Verificando conexiones...');
    await localPool.query('SELECT NOW()');
    console.log('   ✅ Conexión local establecida');
    
    await supabasePool.query('SELECT NOW()');
    console.log('   ✅ Conexión a Supabase establecida\n');

    // Obtener tablas en orden correcto
    const tableOrder = getTableOrder();
    const localTables = await getTables(localPool);
    
    // Filtrar solo las tablas que existen en local
    const tablesToMigrate = tableOrder.filter(table => localTables.includes(table));
    
    console.log(`📊 Tablas a migrar: ${tablesToMigrate.length}\n`);

    // Copiar datos tabla por tabla
    let totalRows = 0;
    for (const table of tablesToMigrate) {
      const rows = await copyTableData(localPool, supabasePool, table);
      totalRows += rows;
    }

    // Resetear secuencias
    console.log('\n');
    await resetSequences(supabasePool);

    console.log('\n✅ Migración completada exitosamente!');
    console.log(`📊 Total de filas migradas: ${totalRows}`);
    console.log('\n💡 Próximos pasos:');
    console.log('   1. Verifica los datos en Supabase');
    console.log('   2. Actualiza tu .env para usar DATABASE_URL');
    console.log('   3. Reinicia tu aplicación');

  } catch (error) {
    console.error('\n❌ Error durante la migración:', error);
    process.exit(1);
  } finally {
    await localPool.end();
    await supabasePool.end();
  }
}

// Ejecutar migración
if (require.main === module) {
  migrate().catch(console.error);
}

module.exports = { migrate };

