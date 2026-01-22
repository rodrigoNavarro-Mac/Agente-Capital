
import { query, pool } from '../src/lib/db/postgres';

async function main() {
    try {
        console.log('--- DISTINCT LEAD STATUSES ---');
        const result = await query('SELECT DISTINCT lead_status FROM zoho_leads ORDER BY lead_status');
        console.table(result.rows);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
