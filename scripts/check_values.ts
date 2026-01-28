
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- CHECKING DISTINCT VALUES ---');

        const distinctStatuses = await pool.query(`
            SELECT DISTINCT data->>'Lead_Status' as status 
            FROM zoho_leads 
            ORDER BY status`
        );
        console.log('\nDISTINCT LEAD STATUSES:');
        distinctStatuses.rows.forEach(r => console.log(`- ${r.status}`));

        const distinctReasons = await pool.query(`
            SELECT DISTINCT data->>'Raz_n_de_descarte' as reason 
            FROM zoho_leads 
            WHERE data->>'Raz_n_de_descarte' IS NOT NULL
            ORDER BY reason`
        );
        console.log('\nDISTINCT DISCARD REASONS:');
        distinctReasons.rows.forEach(r => console.log(`- ${r.reason}`));

    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

main();
