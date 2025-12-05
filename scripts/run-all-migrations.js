/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - RUN ALL MIGRATIONS
 * =====================================================
 * Ejecuta todas las migraciones SQL en orden
 * 
 * Uso: npm run db:migrate:all
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración de conexión
// Soporta múltiples variables: POSTGRES_URL (Vercel), DATABASE_URL, o variables individuales
function getPoolConfig() {
  // Intentar obtener la cadena de conexión en orden de prioridad
  // DATABASE_URL manual tiene prioridad sobre variables automáticas
  const connectionString =
    process.env.DATABASE_URL ||               // ⭐ PRIORIDAD: Manual
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL;

  if (connectionString) {
    // Detectar si es Supabase o conexión remota
    let isSupabase = false;
    let hostname = 'unknown';
    let parsedUrl = null;
    
    try {
      parsedUrl = new URL(connectionString);
      hostname = parsedUrl.hostname;
      isSupabase = hostname.includes('supabase.co') || 
                   hostname.includes('supabase') ||
                   !!process.env.POSTGRES_URL || 
                   !!process.env.POSTGRES_PRISMA_URL ||
                   !!process.env.POSTGRES_URL_NON_POOLING;
      
      // Para Supabase, usar parámetros individuales en lugar de connectionString
      if (isSupabase && parsedUrl) {
        const password = parsedUrl.password || '';
        const username = parsedUrl.username || 'postgres';
        const database = parsedUrl.pathname.slice(1) || 'postgres';
        const port = parseInt(parsedUrl.port || '5432');
        
        return {
          host: hostname,
          port: port,
          user: username,
          password: password,
          database: database,
          ssl: {
            rejectUnauthorized: false,
          },
        };
      }
    } catch (e) {
      isSupabase = !!process.env.POSTGRES_URL || 
                   !!process.env.POSTGRES_PRISMA_URL ||
                   !!process.env.POSTGRES_URL_NON_POOLING;
    }
    
    // Para conexiones no-Supabase
    const sslConfig = hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== 'unknown'
      ? { rejectUnauthorized: false }
      : undefined;
    
    return {
      connectionString: connectionString,
      ssl: sslConfig,
    };
  }

  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'capital_plus_agent',
  };
}

const pool = new Pool(getPoolConfig());

// =====================================================
// FUNCIÓN PARA OBTENER ARCHIVOS DE MIGRACIÓN
// =====================================================

function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Ordenar alfabéticamente para ejecutar en orden
  
  return files.map(file => ({
    name: file,
    path: path.join(migrationsDir, file),
  }));
}

// =====================================================
// FUNCIÓN PARA VERIFICAR SI UNA MIGRACIÓN YA SE EJECUTÓ
// =====================================================

async function checkMigrationExecuted(client, migrationName) {
  try {
    // Verificar si existe la tabla de control de migraciones
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      // Crear tabla de control si no existe
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      return false;
    }
    
    // Verificar si la migración ya se ejecutó
    const result = await client.query(
      'SELECT COUNT(*) FROM schema_migrations WHERE migration_name = $1',
      [migrationName]
    );
    
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    // Si hay error, asumir que no se ejecutó
    return false;
  }
}

// =====================================================
// FUNCIÓN PARA MARCAR MIGRACIÓN COMO EJECUTADA
// =====================================================

async function markMigrationExecuted(client, migrationName) {
  await client.query(
    'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
    [migrationName]
  );
}

// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================

async function runAllMigrations() {
  console.log('🚀 Iniciando ejecución de todas las migraciones...\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener archivos de migración
    const migrationFiles = getMigrationFiles();
    
    if (migrationFiles.length === 0) {
      console.log('⚠️  No se encontraron archivos de migración');
      await client.query('COMMIT');
      return;
    }
    
    console.log(`📦 Se encontraron ${migrationFiles.length} archivo(s) de migración:\n`);
    
    let executedCount = 0;
    let skippedCount = 0;
    
    // Ejecutar cada migración
    for (const migration of migrationFiles) {
      const alreadyExecuted = await checkMigrationExecuted(client, migration.name);
      
      if (alreadyExecuted) {
        console.log(`⏭️  ${migration.name} - Ya ejecutada, omitiendo...`);
        skippedCount++;
        continue;
      }
      
      console.log(`📄 Ejecutando: ${migration.name}`);
      
      try {
        // Leer contenido del archivo SQL
        const sql = fs.readFileSync(migration.path, 'utf8');
        
        // Ejecutar SQL
        await client.query(sql);
        
        // Marcar como ejecutada
        await markMigrationExecuted(client, migration.name);
        
        console.log(`   ✅ ${migration.name} completada\n`);
        executedCount++;
        
      } catch (error) {
        console.error(`   ❌ Error en ${migration.name}:`, error.message);
        throw error;
      }
    }
    
    await client.query('COMMIT');
    
    console.log('\n✅ Proceso de migración completado');
    console.log(`   - Ejecutadas: ${executedCount}`);
    console.log(`   - Omitidas: ${skippedCount}`);
    console.log(`   - Total: ${migrationFiles.length}\n`);
    
    // Mostrar resumen de tablas
    console.log('📊 Tablas en la base de datos:');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error en migración, cambios revertidos:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar migraciones
runAllMigrations().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});

