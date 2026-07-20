/**
 * Script de diagnostico (solo lectura): muestra la estructura real de
 * commission_global_configs y sus filas actuales, para saber que valores
 * usa la columna "phase" que no esta en ninguna migracion del repo.
 *
 * Uso: node scripts/check-global-configs-schema.js
 */

const { Pool } = require('pg');
require('dotenv').config();

function getPoolConfig() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL;

  if (connectionString) {
    let hostname = 'unknown';
    let parsedUrl = null;
    try {
      parsedUrl = new URL(connectionString);
      hostname = parsedUrl.hostname;
      const isSupabase = hostname.includes('supabase');
      if (isSupabase) {
        return {
          host: hostname,
          port: parseInt(parsedUrl.port || '5432'),
          user: parsedUrl.username || 'postgres',
          password: parsedUrl.password || '',
          database: parsedUrl.pathname.slice(1) || 'postgres',
          family: 4,
          ssl: { rejectUnauthorized: false },
        };
      }
    } catch (e) {
      // ignore
    }
    return { connectionString, family: 4, ssl: { rejectUnauthorized: false } };
  }

  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'capital_plus_agent',
  };
}

async function main() {
  const pool = new Pool(getPoolConfig());
  const client = await pool.connect();
  try {
    console.log('=== Columnas de commission_global_configs ===');
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'commission_global_configs'
      ORDER BY ordinal_position
    `);
    console.table(cols.rows);

    console.log('\n=== Constraints (UNIQUE / CHECK) de commission_global_configs ===');
    const constraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'commission_global_configs'::regclass
    `);
    console.table(constraints.rows);

    console.log('\n=== Filas actuales ===');
    const rows = await client.query(`SELECT * FROM commission_global_configs ORDER BY id`);
    console.table(rows.rows);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
