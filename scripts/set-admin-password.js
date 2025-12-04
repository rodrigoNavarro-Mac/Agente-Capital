/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - SET ADMIN PASSWORD
 * =====================================================
 * Script para establecer la contraseña del usuario administrador
 * 
 * Uso: node scripts/set-admin-password.js [password]
 * Si no se proporciona contraseña, se usará 'admin123' por defecto
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configuración de conexión
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'capital_plus_agent',
});

const BCRYPT_ROUNDS = 12;
const ADMIN_EMAIL = 'admin@capitalplus.com';

async function setAdminPassword(password) {
  console.log('🔐 Configurando contraseña del administrador...\n');
  
  const client = await pool.connect();
  
  try {
    // 1. Buscar usuario admin
    const userResult = await client.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );
    
    if (userResult.rows.length === 0) {
      console.error(`❌ Error: No se encontró el usuario con email ${ADMIN_EMAIL}`);
      console.log('\n💡 Asegúrate de haber ejecutado las migraciones primero:');
      console.log('   npm run db:migrate');
      process.exit(1);
    }
    
    const user = userResult.rows[0];
    console.log(`✅ Usuario encontrado: ${user.name} (${user.email})`);
    
    // 2. Hashear la contraseña
    console.log('🔒 Hasheando contraseña...');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    // 3. Actualizar contraseña en la base de datos
    await client.query(
      `UPDATE users 
       SET password_hash = $1, 
           updated_at = CURRENT_TIMESTAMP,
           email_verified = true
       WHERE id = $2`,
      [passwordHash, user.id]
    );
    
    console.log('✅ Contraseña establecida exitosamente\n');
    console.log('📋 Credenciales del Administrador:');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Contraseña: ${password}`);
    console.log('\n⚠️  IMPORTANTE: Cambia esta contraseña después del primer inicio de sesión\n');
    
  } catch (error) {
    console.error('\n❌ Error al establecer contraseña:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Obtener contraseña de los argumentos o usar la por defecto
const password = process.argv[2] || 'admin123';

// Validar que la contraseña tenga al menos 8 caracteres
if (password.length < 8) {
  console.error('❌ Error: La contraseña debe tener al menos 8 caracteres');
  process.exit(1);
}

setAdminPassword(password);

