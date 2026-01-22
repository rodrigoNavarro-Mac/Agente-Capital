
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
        console.log('--- DISTINCT STAGES ---');
        const stages = await pool.query('SELECT DISTINCT stage FROM zoho_deals ORDER BY stage');
        console.table(stages.rows);

        console.log('\n--- SYNC LOGS (Last 5) ---');
        const logs = await pool.query('SELECT * FROM zoho_sync_log ORDER BY started_at DESC LIMIT 5');
        console.table(logs.rows.map(r => ({
            type: r.sync_type,
            status: r.status,
            created: r.records_created,
            updated: r.records_updated,
            failed: r.records_failed,
            error: r.error_message?.substring(0, 50)
        })));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
