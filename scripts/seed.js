/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - DATABASE SEED SCRIPT
 * =====================================================
 * Inserta datos de prueba en la base de datos.
 * 
 * Uso: npm run db:seed
 */

const { Pool } = require('pg');
require('dotenv').config();

// Configuración de conexión
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'capital_plus_agent',
});

// =====================================================
// DATOS DE PRUEBA
// =====================================================

const seedData = {
  // Usuarios de prueba
  users: [
    { email: 'ventas@capitalplus.com', name: 'Equipo Ventas', role: 'sales' },
    { email: 'soporte@capitalplus.com', name: 'Equipo Soporte', role: 'support' },
    { email: 'manager@capitalplus.com', name: 'Gerente Desarrollos', role: 'manager' },
    { email: 'demo@capitalplus.com', name: 'Usuario Demo', role: 'viewer' },
  ],

  // Asignaciones de desarrollos a usuarios
  userDevelopments: [
    // Ventas tiene acceso a Yucatán
    { email: 'ventas@capitalplus.com', zone: 'yucatan', development: 'riviera', can_upload: true, can_query: true },
    { email: 'ventas@capitalplus.com', zone: 'yucatan', development: 'campo_magno', can_upload: true, can_query: true },
    { email: 'ventas@capitalplus.com', zone: 'yucatan', development: 'augusta', can_upload: false, can_query: true },
    
    // Soporte tiene acceso a todos en modo query
    { email: 'soporte@capitalplus.com', zone: 'yucatan', development: 'riviera', can_upload: false, can_query: true },
    { email: 'soporte@capitalplus.com', zone: 'puebla', development: 'lomas_angelopolis', can_upload: false, can_query: true },
    { email: 'soporte@capitalplus.com', zone: 'quintana_roo', development: 'fuego', can_upload: false, can_query: true },
    
    // Manager tiene acceso total a varios
    { email: 'manager@capitalplus.com', zone: 'yucatan', development: 'riviera', can_upload: true, can_query: true },
    { email: 'manager@capitalplus.com', zone: 'yucatan', development: 'campo_magno', can_upload: true, can_query: true },
    { email: 'manager@capitalplus.com', zone: 'puebla', development: 'lomas_angelopolis', can_upload: true, can_query: true },
    { email: 'manager@capitalplus.com', zone: 'quintana_roo', development: 'fuego', can_upload: true, can_query: true },
  ],

  // Configuración adicional del agente
  agentConfig: [
    { key: 'welcome_message', value: 'Bienvenido al Agente de Capital Plus. ¿En qué puedo ayudarte hoy?' },
    { key: 'max_query_length', value: '2000' },
    { key: 'enable_source_citations', value: 'true' },
    { key: 'default_zone', value: 'yucatan' },
  ],
};

// =====================================================
// FUNCIÓN PRINCIPAL DE SEED
// =====================================================

async function runSeed() {
  console.log('🌱 Iniciando seed de datos de prueba...\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Insertar usuarios
    console.log('👥 Insertando usuarios...');
    for (const user of seedData.users) {
      const roleResult = await client.query(
        'SELECT id FROM roles WHERE name = $1',
        [user.role]
      );
      
      if (roleResult.rows.length > 0) {
        await client.query(
          `INSERT INTO users (email, name, role_id, is_active) 
           VALUES ($1, $2, $3, true) 
           ON CONFLICT (email) DO UPDATE SET name = $2, role_id = $3`,
          [user.email, user.name, roleResult.rows[0].id]
        );
        console.log(`   ✅ Usuario: ${user.email}`);
      }
    }

    // 2. Insertar asignaciones de desarrollos
    console.log('\n🏠 Asignando desarrollos a usuarios...');
    for (const ud of seedData.userDevelopments) {
      const userResult = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [ud.email]
      );
      
      if (userResult.rows.length > 0) {
        await client.query(
          `INSERT INTO user_developments (user_id, zone, development, can_upload, can_query) 
           VALUES ($1, $2, $3, $4, $5) 
           ON CONFLICT (user_id, zone, development) DO UPDATE 
           SET can_upload = $4, can_query = $5`,
          [userResult.rows[0].id, ud.zone, ud.development, ud.can_upload, ud.can_query]
        );
        console.log(`   ✅ ${ud.email} -> ${ud.zone}/${ud.development}`);
      }
    }

    // 3. Insertar configuración adicional
    console.log('\n⚙️ Insertando configuración adicional...');
    for (const config of seedData.agentConfig) {
      await client.query(
        `INSERT INTO agent_config (key, value) 
         VALUES ($1, $2) 
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [config.key, config.value]
      );
      console.log(`   ✅ Config: ${config.key}`);
    }

    await client.query('COMMIT');
    
    console.log('\n✅ Seed completado exitosamente');
    
    // Mostrar resumen
    console.log('\n📊 Resumen de datos insertados:');
    
    const usersCount = await client.query('SELECT COUNT(*) FROM users');
    const devsCount = await client.query('SELECT COUNT(*) FROM user_developments');
    const configCount = await client.query('SELECT COUNT(*) FROM agent_config');
    
    console.log(`   - Usuarios: ${usersCount.rows[0].count}`);
    console.log(`   - Asignaciones de desarrollos: ${devsCount.rows[0].count}`);
    console.log(`   - Configuraciones: ${configCount.rows[0].count}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error en seed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar seed
runSeed();

