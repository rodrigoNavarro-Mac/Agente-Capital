
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        const res = await pool.query(`
      SELECT COUNT(*) as count
      FROM zoho_deals 
      WHERE (LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%')
      AND (closing_date IS NULL)
    `);

        console.log(`NULL CLOSING DATES COUNT: ${res.rows[0].count}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
