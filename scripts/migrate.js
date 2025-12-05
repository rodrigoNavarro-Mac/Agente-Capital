/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - DATABASE MIGRATION SCRIPT
 * =====================================================
 * Ejecuta las migraciones para crear todas las tablas
 * necesarias en PostgreSQL.
 * 
 * Uso: 
 *   npm run db:migrate          → Crear tablas (si no existen)
 *   npm run db:migrate -- reset → Eliminar y recrear todas las tablas
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Verificar si es un reset
const isReset = process.argv.includes('reset') || process.argv.includes('--reset');

// Configuración de conexión
// Soporta múltiples variables: POSTGRES_URL (Vercel), DATABASE_URL, o variables individuales
function getPoolConfig() {
  // Intentar obtener la cadena de conexión en orden de prioridad
  // IMPORTANTE: pg necesita NON_POOLING en serverless
  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING ||  // ⭐ PRIORIDAD para pg en Vercel
    process.env.DATABASE_URL ||
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
// SQL PARA LIMPIAR TABLAS (RESET)
// =====================================================

const dropTablesSQL = `
  -- Eliminar triggers primero
  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  DROP TRIGGER IF EXISTS update_documents_meta_updated_at ON documents_meta;
  DROP TRIGGER IF EXISTS update_agent_config_updated_at ON agent_config;
  DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
  
  -- Eliminar función
  DROP FUNCTION IF EXISTS update_updated_at_column();
  
  -- Eliminar tablas en orden correcto (por dependencias)
  DROP TABLE IF EXISTS query_logs_chunks CASCADE;
  DROP TABLE IF EXISTS chunk_stats CASCADE;
  DROP TABLE IF EXISTS response_learning CASCADE;
  DROP TABLE IF EXISTS agent_memory CASCADE;
  DROP TABLE IF EXISTS query_logs CASCADE;
  DROP TABLE IF EXISTS query_cache CASCADE;
  DROP TABLE IF EXISTS action_logs CASCADE;
  DROP TABLE IF EXISTS documents_meta CASCADE;
  DROP TABLE IF EXISTS user_developments CASCADE;
  DROP TABLE IF EXISTS agent_config CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
  DROP TABLE IF EXISTS role_permissions CASCADE;
  DROP TABLE IF EXISTS permissions CASCADE;
  DROP TABLE IF EXISTS roles CASCADE;
  DROP TABLE IF EXISTS schema_migrations CASCADE;
`;

// =====================================================
// MIGRACIONES SQL
// =====================================================

const migrations = [
  // 1. Crear extensiones necesarias
  {
    name: 'create_extensions',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `,
  },

  // 2. Tabla de roles
  {
    name: 'create_roles_table',
    sql: `
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },

  // 3. Insertar roles por defecto (deben coincidir con src/lib/constants.ts)
  {
    name: 'insert_default_roles',
    sql: `
      INSERT INTO roles (name, description) VALUES
        ('ceo', 'CEO - Acceso total al sistema'),
        ('admin', 'Administrador - Gestión completa del sistema'),
        ('sales_manager', 'Gerente de Ventas - Gestión de ventas y desarrollos'),
        ('sales_agent', 'Agente de Ventas - Consultas y uploads limitados'),
        ('post_sales', 'Post-Venta - Soporte al cliente post-venta'),
        ('legal_manager', 'Gerente Legal - Gestión de documentos legales'),
        ('marketing_manager', 'Gerente de Marketing - Gestión de marketing y contenido')
      ON CONFLICT (name) DO NOTHING;
    `,
  },

  // 4. Tabla de permisos
  {
    name: 'create_permissions_table',
    sql: `
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },

  // 5. Insertar permisos por defecto (separado)
  {
    name: 'insert_default_permissions',
    sql: `
      INSERT INTO permissions (name, description) VALUES
        ('upload_documents', 'Puede subir documentos al sistema'),
        ('delete_documents', 'Puede eliminar documentos'),
        ('query_agent', 'Puede realizar consultas al agente'),
        ('manage_users', 'Puede gestionar usuarios'),
        ('manage_config', 'Puede modificar configuración del agente'),
        ('view_logs', 'Puede ver logs de consultas'),
        ('manage_developments', 'Puede gestionar desarrollos')
      ON CONFLICT (name) DO NOTHING;
    `,
  },

  // 6. Tabla de relación roles-permisos
  {
    name: 'create_role_permissions_table',
    sql: `
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );
    `,
  },

  // 7. Insertar asignaciones de permisos a roles (deben coincidir con src/lib/constants.ts)
  {
    name: 'insert_role_permissions',
    sql: `
      -- CEO: todos los permisos
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'ceo'
      ON CONFLICT DO NOTHING;
      
      -- Admin: todos los permisos
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'
      ON CONFLICT DO NOTHING;
      
      -- Sales Manager: upload, query, view_logs, manage_developments
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p 
      WHERE r.name = 'sales_manager' AND p.name IN ('upload_documents', 'query_agent', 'view_logs', 'manage_developments')
      ON CONFLICT DO NOTHING;
      
      -- Sales Agent: upload, query, view_logs
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p 
      WHERE r.name = 'sales_agent' AND p.name IN ('upload_documents', 'query_agent', 'view_logs')
      ON CONFLICT DO NOTHING;
      
      -- Post Sales: query, view_logs
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p 
      WHERE r.name = 'post_sales' AND p.name IN ('query_agent', 'view_logs')
      ON CONFLICT DO NOTHING;
      
      -- Legal Manager: upload, query, view_logs, manage_developments
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p 
      WHERE r.name = 'legal_manager' AND p.name IN ('upload_documents', 'query_agent', 'view_logs', 'manage_developments')
      ON CONFLICT DO NOTHING;
      
      -- Marketing Manager: upload, query, view_logs, manage_developments
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p 
      WHERE r.name = 'marketing_manager' AND p.name IN ('upload_documents', 'query_agent', 'view_logs', 'manage_developments')
      ON CONFLICT DO NOTHING;
    `,
  },

  // 8. Tabla de usuarios
  {
    name: 'create_users_table',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role_id INTEGER REFERENCES roles(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Crear índices
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
    `,
  },

  // 9. Insertar usuario admin
  {
    name: 'insert_admin_user',
    sql: `
      INSERT INTO users (email, name, role_id, is_active)
      SELECT 'admin@capitalplus.com', 'Administrador', r.id, true
      FROM roles r WHERE r.name = 'admin'
      ON CONFLICT (email) DO NOTHING;
    `,
  },

  // 10. Tabla de relación usuarios-desarrollos
  {
    name: 'create_user_developments_table',
    sql: `
      CREATE TABLE IF NOT EXISTS user_developments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        zone VARCHAR(100) NOT NULL,
        development VARCHAR(255) NOT NULL,
        can_upload BOOLEAN DEFAULT false,
        can_query BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, zone, development)
      );
      
      -- Crear índices
      CREATE INDEX IF NOT EXISTS idx_user_dev_user ON user_developments(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_dev_zone ON user_developments(zone);
    `,
  },

  // 11. Tabla de metadata de documentos
  {
    name: 'create_documents_meta_table',
    sql: `
      CREATE TABLE IF NOT EXISTS documents_meta (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        zone VARCHAR(100) NOT NULL,
        development VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        uploaded_by INTEGER REFERENCES users(id),
        pinecone_namespace VARCHAR(255) NOT NULL,
        tags TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Crear índices
      CREATE INDEX IF NOT EXISTS idx_docs_zone ON documents_meta(zone);
      CREATE INDEX IF NOT EXISTS idx_docs_development ON documents_meta(development);
      CREATE INDEX IF NOT EXISTS idx_docs_type ON documents_meta(type);
      CREATE INDEX IF NOT EXISTS idx_docs_uploaded_by ON documents_meta(uploaded_by);
    `,
  },

  // 12. Tabla de logs de consultas
  {
    name: 'create_query_logs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS query_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        query TEXT NOT NULL,
        zone VARCHAR(100) NOT NULL,
        development VARCHAR(255) NOT NULL,
        response TEXT,
        sources_used TEXT[],
        response_time_ms INTEGER,
        tokens_used INTEGER,
        feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
        feedback_comment TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Crear índices
      CREATE INDEX IF NOT EXISTS idx_logs_user ON query_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_logs_zone ON query_logs(zone);
      CREATE INDEX IF NOT EXISTS idx_logs_development ON query_logs(development);
      CREATE INDEX IF NOT EXISTS idx_logs_created ON query_logs(created_at);
    `,
  },

  // 13. Tabla de configuración del agente
  {
    name: 'create_agent_config_table',
    sql: `
      CREATE TABLE IF NOT EXISTS agent_config (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },

  // 14. Insertar configuración por defecto
  {
    name: 'insert_default_config',
    sql: `
      INSERT INTO agent_config (key, value, description) VALUES
        ('temperature', '0.2', 'Temperatura del modelo LLM (0-2)'),
        ('top_k', '5', 'Número de resultados a recuperar de Pinecone'),
        ('chunk_size', '500', 'Tamaño máximo de chunks en tokens'),
        ('chunk_overlap', '50', 'Solapamiento entre chunks en tokens'),
        ('max_tokens', '2048', 'Tokens máximos de respuesta del LLM')
      ON CONFLICT (key) DO NOTHING;
    `,
  },

  // 15. Función para actualizar updated_at automáticamente
  {
    name: 'create_update_timestamp_function',
    sql: `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
      
      -- Aplicar triggers a las tablas
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
      DROP TRIGGER IF EXISTS update_documents_meta_updated_at ON documents_meta;
      CREATE TRIGGER update_documents_meta_updated_at
        BEFORE UPDATE ON documents_meta
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
      DROP TRIGGER IF EXISTS update_agent_config_updated_at ON agent_config;
      CREATE TRIGGER update_agent_config_updated_at
        BEFORE UPDATE ON agent_config
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
      DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
      CREATE TRIGGER update_roles_updated_at
        BEFORE UPDATE ON roles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `,
  },
];

// =====================================================
// FUNCIÓN PRINCIPAL DE MIGRACIÓN
// =====================================================

async function runMigrations() {
  console.log('🚀 Iniciando migraciones de base de datos...\n');
  
  if (isReset) {
    console.log('⚠️  MODO RESET: Se eliminarán todas las tablas existentes\n');
  }
  
  const client = await pool.connect();
  
  try {
    // Comenzar transacción
    await client.query('BEGIN');
    
    // Si es reset, eliminar tablas primero
    if (isReset) {
      console.log('🗑️  Eliminando tablas existentes...');
      await client.query(dropTablesSQL);
      console.log('   ✅ Tablas eliminadas\n');
    }
    
    // Ejecutar migraciones
    for (const migration of migrations) {
      console.log(`📦 Ejecutando migración: ${migration.name}`);
      
      try {
        await client.query(migration.sql);
        console.log(`   ✅ ${migration.name} completada`);
      } catch (error) {
        console.error(`   ❌ Error en ${migration.name}:`, error.message);
        throw error;
      }
    }
    
    // Ejecutar migraciones de archivos SQL adicionales
    console.log('\n📄 Ejecutando migraciones de archivos SQL...');
    
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const sqlFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      // Verificar si existe la tabla de control de migraciones
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
      }
      
      // Archivos SQL que ya están cubiertos por migraciones hardcodeadas
      const skippedMigrations = [
        '001_initial_schema.sql', // Ya cubierto por migraciones hardcodeadas
      ];
      
      for (const sqlFile of sqlFiles) {
        // Omitir migraciones que ya están cubiertas
        if (skippedMigrations.includes(sqlFile)) {
          console.log(`   ⏭️  ${sqlFile} - Omitida (ya cubierta por migraciones hardcodeadas)`);
          continue;
        }
        
        // Verificar si ya se ejecutó
        const checkResult = await client.query(
          'SELECT COUNT(*) FROM schema_migrations WHERE migration_name = $1',
          [sqlFile]
        );
        
        if (parseInt(checkResult.rows[0].count) > 0) {
          console.log(`   ⏭️  ${sqlFile} - Ya ejecutada, omitiendo...`);
          continue;
        }
        
        console.log(`   📄 Ejecutando: ${sqlFile}`);
        
        try {
          const sqlPath = path.join(migrationsDir, sqlFile);
          const sql = fs.readFileSync(sqlPath, 'utf8');
          
          await client.query(sql);
          
          // Marcar como ejecutada
          await client.query(
            'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
            [sqlFile]
          );
          
          console.log(`      ✅ ${sqlFile} completada`);
        } catch (error) {
          console.error(`      ❌ Error en ${sqlFile}:`, error.message);
          throw error;
        }
      }
    }
    
    // Confirmar transacción
    await client.query('COMMIT');
    
    console.log('\n✅ Todas las migraciones completadas exitosamente');
    
    // Mostrar resumen
    console.log('\n📊 Resumen de tablas creadas:');
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
    // Revertir en caso de error
    await client.query('ROLLBACK');
    console.error('\n❌ Error en migración, cambios revertidos:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar migraciones
runMigrations();
