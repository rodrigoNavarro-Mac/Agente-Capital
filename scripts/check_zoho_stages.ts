
import { query, pool } from '../src/lib/db/postgres';
import { countZohoClosedWonDealsFromDB } from '../src/lib/db/postgres';

async function main() {
    try {
        console.log('--- DISTINCT STAGES IN ZOHO DEALS ---');
        const stagesResult = await query('SELECT DISTINCT stage FROM zoho_deals ORDER BY stage');
        console.table(stagesResult.rows);

        console.log('\n--- SAMPLE "WON" DEALS ---');
        // Find deals that look like they are won
        const sampleResult = await query(`
      SELECT id, deal_name, stage, closing_date, amount, created_time, data->>'Closing_Date' as json_closing
      FROM zoho_deals 
      WHERE LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%'
      LIMIT 5
    `);
        console.table(sampleResult.rows);

        console.log('\n--- COUNT TEST ---');
        const count = await countZohoClosedWonDealsFromDB();
        console.log(`countZohoClosedWonDealsFromDB() result: ${count}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
