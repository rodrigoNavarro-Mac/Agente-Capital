/**
 * =====================================================
 * GENERADOR DE HASH DE CONTRASEÑA
 * =====================================================
 * Script simple para generar un hash de contraseña
 * SIN conectarse a la base de datos
 * 
 * Uso: node scripts/generate-hash.js TuContraseña
 */

const bcrypt = require('bcryptjs');

// Mismo número de rondas que usa el sistema
const BCRYPT_ROUNDS = 12;

async function generateHash() {
  // Obtener contraseña del argumento
  const password = process.argv[2];
  
  // Validaciones
  if (!password) {
    console.error('❌ Error: Debes proporcionar una contraseña');
    console.log('\n💡 Uso: node scripts/generate-hash.js TuContraseña\n');
    process.exit(1);
  }
  
  if (password.length < 8) {
    console.error('❌ Error: La contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }
  
  console.log('🔐 Generando hash de contraseña...\n');
  console.log(`📝 Contraseña: ${password}`);
  console.log(`🔒 Rondas de bcrypt: ${BCRYPT_ROUNDS}`);
  
  // Generar hash
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  
  console.log('\n✅ Hash generado exitosamente!\n');
  console.log('================================================');
  console.log('HASH DE LA CONTRASEÑA:');
  console.log('================================================');
  console.log(hash);
  console.log('================================================\n');
  
  console.log('📋 Query SQL para actualizar en Supabase:');
  console.log('================================================');
  console.log(`UPDATE users`);
  console.log(`SET password_hash = '${hash}',`);
  console.log(`    email_verified = true,`);
  console.log(`    updated_at = CURRENT_TIMESTAMP`);
  console.log(`WHERE email = 'admin@capitalplus.com';`);
  console.log('================================================\n');
  
  console.log('⚠️  INSTRUCCIONES:');
  console.log('1. Copia el hash de arriba');
  console.log('2. Ve a Supabase SQL Editor');
  console.log('3. Ejecuta el query SQL mostrado arriba');
  console.log('4. ¡Listo! Ya puedes iniciar sesión con la nueva contraseña\n');
}

generateHash().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

