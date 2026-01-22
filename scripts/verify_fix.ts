
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
        console.log('--- VERIFYING FIX IMPACT ---');

        // OLD LOGIC COUNT
        // Filter by a wide range to simulate "All Time" but forcing date logic usage
        // We use '2000-01-01' as start date to ensure date logic is applied
        const oldLogicQuery = `
      SELECT COUNT(*) as count FROM zoho_deals 
      WHERE (LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%')
      AND (
        COALESCE(
          closing_date,
          CASE WHEN (data->>'Closing_Date') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (data->>'Closing_Date')::date ELSE NULL END
        ) >= '2000-01-01'::date
      )
    `;
        const oldResult = await pool.query(oldLogicQuery);
        console.log(`OLD Logic Count (with date filter): ${oldResult.rows[0].count}`);

        // NEW LOGIC COUNT
        const newLogicQuery = `
      SELECT COUNT(*) as count FROM zoho_deals 
      WHERE (LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%')
      AND (
        COALESCE(
          closing_date,
          CASE
            WHEN (data->>'Closing_Date') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (data->>'Closing_Date')::date
            WHEN (data->>'Closed_Time') IS NOT NULL AND (data->>'Closed_Time') != '' THEN (data->>'Closed_Time')::date
            WHEN (data->>'Closed_Date') IS NOT NULL AND (data->>'Closed_Date') != '' THEN (data->>'Closed_Date')::date
            ELSE modified_time::date
          END
        ) >= '2000-01-01'::date
      )
    `;
        const newResult = await pool.query(newLogicQuery);
        console.log(`NEW Logic Count (with date filter): ${newResult.rows[0].count}`);

        // TOTAL WON DEALS (Reference)
        const totalQuery = `
      SELECT COUNT(*) as count FROM zoho_deals 
      WHERE (LOWER(stage) LIKE '%won%' OR LOWER(stage) LIKE '%ganado%')
    `;
        const totalResult = await pool.query(totalQuery);
        console.log(`Total Won Deals in DB (no date filter): ${totalResult.rows[0].count}`);

        if (parseInt(newResult.rows[0].count) > parseInt(oldResult.rows[0].count)) {
            console.log('SUCCESS: The new logic captures more deals!');
        } else {
            console.log('NOTE: Counts are the same. This means all current "Won" deals already had a valid Closing_Date.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
