
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
        console.log('--- ALL WON DEALS (ID, Stage, ClosingDate) ---');
        const res = await pool.query(`
      SELECT id, stage, closing_date, data->>'Closing_Date' as json_closing, modified_time
      FROM zoho_deals 
      WHERE LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%'
    `);

        if (res.rows.length === 0) {
            console.log('No deals found with stage containing "won" or "ganado"');
        } else {
            res.rows.forEach(row => {
                console.log(JSON.stringify(row));
            });
        }

        console.log('\n--- DISTINCT STAGES ---');
        const stages = await pool.query('SELECT DISTINCT stage FROM zoho_deals');
        stages.rows.forEach(row => console.log(row.stage));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
