/**
 * =====================================================
 * SCRIPT PARA EJECUTAR MIGRACIONES
 * =====================================================
 * Ejecuta archivos SQL de migración en PostgreSQL
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración de PostgreSQL desde variables de entorno
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

async function runMigration(migrationFile) {
  const client = await pool.connect();
  
  try {
    console.log(`📄 Leyendo migración: ${migrationFile}`);
    const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Archivo de migración no encontrado: ${migrationPath}`);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🚀 Ejecutando migración...');
    await client.query('BEGIN');
    
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migración ejecutada exitosamente');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error.message);
    if (error.code === '42P07') {
      console.log('ℹ️  La tabla ya existe, esto es normal si la migración ya se ejecutó antes');
    } else {
      process.exit(1);
    }
  } finally {
    client.release();
  }
}

// Obtener el archivo de migración desde los argumentos
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Uso: node scripts/run-migration.js <nombre-archivo.sql>');
  console.log('\nEjemplo:');
  console.log('  node scripts/run-migration.js 002_action_logs.sql');
  process.exit(1);
}

// Ejecutar migración
runMigration(migrationFile)
  .then(() => {
    console.log('✨ Proceso completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });

