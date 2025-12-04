/**
 * Script para limpiar query_logs antiguos del usuario 1
 * Estos logs fueron creados antes de la implementación de seguridad
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  database: process.env.POSTGRES_DB || 'capital_plus_agent',
});

async function showUser1Logs() {
  console.log('📊 Consultando logs del usuario 1...\n');
  
  const client = await pool.connect();
  try {
    // Contar total de logs
    const countResult = await client.query(
      'SELECT COUNT(*) as total, MIN(created_at) as primer_log, MAX(created_at) as ultimo_log FROM query_logs WHERE user_id = 1'
    );
    const stats = countResult.rows[0];
    console.log(`📋 Total de logs del usuario 1: ${stats.total}`);
    console.log(`📅 Primer log: ${stats.primer_log || 'N/A'}`);
    console.log(`📅 Último log: ${stats.ultimo_log || 'N/A'}\n`);

    // Mostrar logs agrupados por fecha
    const dateResult = await client.query(
      `SELECT 
        DATE(created_at) as fecha,
        COUNT(*) as cantidad,
        STRING_AGG(DISTINCT zone, ', ') as zonas,
        STRING_AGG(DISTINCT development, ', ') as desarrollos
       FROM query_logs
       WHERE user_id = 1
       GROUP BY DATE(created_at)
       ORDER BY fecha DESC
       LIMIT 10`
    );
    
    if (dateResult.rows.length > 0) {
      console.log('📅 Logs agrupados por fecha:');
      dateResult.rows.forEach(row => {
        console.log(`  ${row.fecha}: ${row.cantidad} logs - Zonas: ${row.zonas}, Desarrollos: ${row.desarrollos}`);
      });
      console.log('');
    }

    // Mostrar últimos 10 logs
    const recentResult = await client.query(
      `SELECT id, zone, development, LEFT(query, 50) as query_preview, created_at
       FROM query_logs
       WHERE user_id = 1
       ORDER BY created_at DESC
       LIMIT 10`
    );
    
    if (recentResult.rows.length > 0) {
      console.log('📝 Últimos 10 logs:');
      recentResult.rows.forEach(row => {
        console.log(`  ID ${row.id} [${row.zone}/${row.development}] (${row.created_at}): ${row.query_preview}...`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error consultando logs:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function deleteUser1Logs(options = {}) {
  const { beforeDate, zone, development, confirm } = options;
  
  if (!confirm) {
    console.error('❌ Error: Debes confirmar la eliminación con --confirm');
    console.log('\n💡 Uso:');
    console.log('  node scripts/cleanup-old-query-logs.js --delete --confirm');
    console.log('  node scripts/cleanup-old-query-logs.js --delete --before-date "2024-12-01" --confirm');
    console.log('  node scripts/cleanup-old-query-logs.js --delete --zone "quintana_roo" --development "fuego" --confirm');
    process.exit(1);
  }

  console.log('🗑️  Eliminando logs del usuario 1...\n');
  
  const client = await pool.connect();
  try {
    let query = 'DELETE FROM query_logs WHERE user_id = 1';
    const params = [];
    let paramIndex = 1;

    if (beforeDate) {
      query += ` AND created_at < $${paramIndex++}`;
      params.push(beforeDate);
      console.log(`📅 Eliminando logs anteriores a: ${beforeDate}`);
    }

    if (zone) {
      query += ` AND zone = $${paramIndex++}`;
      params.push(zone);
      console.log(`📍 Filtrando por zona: ${zone}`);
    }

    if (development) {
      query += ` AND development = $${paramIndex++}`;
      params.push(development);
      console.log(`🏗️  Filtrando por desarrollo: ${development}`);
    }

    console.log('');

    const result = await client.query(query, params);
    console.log(`✅ Se eliminaron ${result.rowCount} log(s) del usuario 1\n`);

  } catch (error) {
    console.error('❌ Error eliminando logs:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
const isDelete = args.includes('--delete');
const confirm = args.includes('--confirm');
const beforeDateIndex = args.indexOf('--before-date');
const beforeDate = beforeDateIndex !== -1 ? args[beforeDateIndex + 1] : null;
const zoneIndex = args.indexOf('--zone');
const zone = zoneIndex !== -1 ? args[zoneIndex + 1] : null;
const developmentIndex = args.indexOf('--development');
const development = developmentIndex !== -1 ? args[developmentIndex + 1] : null;

if (isDelete) {
  deleteUser1Logs({ beforeDate, zone, development, confirm });
} else {
  showUser1Logs().then(() => pool.end());
}

