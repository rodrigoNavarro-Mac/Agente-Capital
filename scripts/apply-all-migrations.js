/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - APPLY ALL MIGRATIONS
 * =====================================================
 * Ejecuta primero db:migrate y luego todas las migraciones SQL adicionales
 * 
 * Uso: npm run db:migrate:apply
 */

const { execSync } = require('child_process');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración de conexión
// Soporta múltiples variables: POSTGRES_URL (Vercel), DATABASE_URL, o variables individuales
function getPoolConfig() {
  // Intentar obtener la cadena de conexión en orden de prioridad
  // Compatible con integración de Supabase en Vercel y configuraciones locales
  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL;

  if (connectionString) {
    return {
      connectionString: connectionString,
      ssl: connectionString.includes('supabase') 
        ? { rejectUnauthorized: false } 
        : undefined,
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
// FUNCIÓN PARA OBTENER ARCHIVOS DE MIGRACIÓN SQL
// =====================================================

function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') && file !== '001_initial_schema.sql') // Excluir la inicial
    .sort(); // Ordenar alfabéticamente
  
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
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      return false;
    }
    
    const result = await client.query(
      'SELECT COUNT(*) FROM schema_migrations WHERE migration_name = $1',
      [migrationName]
    );
    
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
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

async function applyAllMigrations() {
  console.log('🚀 Iniciando aplicación de todas las migraciones...\n');
  
  try {
    // Paso 1: Ejecutar migración inicial (db:migrate)
    console.log('📦 Paso 1: Ejecutando migración inicial (db:migrate)...\n');
    try {
      execSync('npm run db:migrate', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('\n✅ Migración inicial completada\n');
    } catch (error) {
      console.error('\n❌ Error en migración inicial:', error.message);
      // Continuar de todas formas, puede que ya esté ejecutada
    }
    
    // Paso 2: Ejecutar migraciones SQL adicionales
    console.log('📦 Paso 2: Ejecutando migraciones SQL adicionales...\n');
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const migrationFiles = getMigrationFiles();
      
      if (migrationFiles.length === 0) {
        console.log('⚠️  No se encontraron migraciones SQL adicionales\n');
        await client.query('COMMIT');
        return;
      }
      
      console.log(`📦 Se encontraron ${migrationFiles.length} migración(es) adicional(es):\n`);
      
      let executedCount = 0;
      let skippedCount = 0;
      
      for (const migration of migrationFiles) {
        const alreadyExecuted = await checkMigrationExecuted(client, migration.name);
        
        if (alreadyExecuted) {
          console.log(`⏭️  ${migration.name} - Ya ejecutada, omitiendo...`);
          skippedCount++;
          continue;
        }
        
        console.log(`📄 Ejecutando: ${migration.name}`);
        
        try {
          const sql = fs.readFileSync(migration.path, 'utf8');
          await client.query(sql);
          await markMigrationExecuted(client, migration.name);
          console.log(`   ✅ ${migration.name} completada\n`);
          executedCount++;
        } catch (error) {
          console.error(`   ❌ Error en ${migration.name}:`, error.message);
          // Si es un error de "ya existe", continuar
          if (error.code === '42P07' || error.message.includes('already exists')) {
            console.log(`   ⚠️  ${migration.name} parece ya estar aplicada, continuando...\n`);
            await markMigrationExecuted(client, migration.name);
            skippedCount++;
          } else {
            throw error;
          }
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
      console.error('\n❌ Error en migraciones SQL, cambios revertidos:', error.message);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
    
  } catch (error) {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar
applyAllMigrations().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});

