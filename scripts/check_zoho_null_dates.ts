
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
        console.log('--- WON DEALS WITH NULL CLOSING DATE ---');
        const res = await pool.query(`
      SELECT id, stage, closing_date, data->>'Closing_Date' as json_closing, modified_time
      FROM zoho_deals 
      WHERE (LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%')
      AND (closing_date IS NULL)
    `);

        console.log(`Found ${res.rows.length} won deals with NULL closing_date column.`);
        if (res.rows.length > 0) {
            console.table(res.rows);
        }

        console.log('\n--- WON DEALS WITH VALID CLOSING DATE ---');
        const resValid = await pool.query(`
      SELECT id, stage, closing_date, data->>'Closing_Date' as json_closing
      FROM zoho_deals 
      WHERE (LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%')
      AND (closing_date IS NOT NULL)
      LIMIT 5
    `);
        console.table(resValid.rows);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
