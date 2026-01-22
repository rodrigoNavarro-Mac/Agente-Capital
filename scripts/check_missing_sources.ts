
import { query, pool } from '../src/lib/db/postgres';

async function main() {
    try {
        console.log('--- CHECKING MISSING SOURCES FOR QUALITY LEADS ---');

        // 1. Check Leads: Solicito_visita_cita = true AND Lead_Status LIKE '%Contactado%'
        // Note: Field names in DB might be snake_case or JSON. 
        // Based on previous files, we use structured columns usually.
        // Let's check `lead_source` column.

        // We rely on the fact that `zoho_leads` has `lead_source` and `lead_status`.
        // `Solicito_visita_cita` might be in a `data` JSONB column or a specific column.
        // Let's try to select everything from a few matching leads to see structure.

        console.log('Fetching sample quality leads...');
        const res = await query(`
            SELECT id, full_name, lead_source, lead_status, data
            FROM zoho_leads 
            WHERE 
              (LOWER(lead_status) LIKE '%contactado%')
              AND (data->>'Solicito_visita_cita' = 'true' OR data->>'Solicito_visita_cita' = 'True')
        `);

        console.log(`Found ${res.rows.length} potential quality leads.`);

        res.rows.forEach(r => {
            const source = r.lead_source || r.data?.Lead_Source;
            if (!source) {
                console.log(`[LEAD WITHOUT SOURCE] ID: ${r.id}, Name: ${r.full_name}, Status: ${r.lead_status}`);
                console.log('Data:', JSON.stringify(r.data, null, 2));
            } else {
                // console.log(`[OK] ID: ${r.id}, Source: ${source}`);
            }
        });

        // 2. Check Deals
        // We need deals where "Creacion_de_Lead" is in recent period, but for now just check if any deal has missing source.
        console.log('\n--- CHECKING DEALS WITHOUT SOURCE ---');
        const resDeals = await query(`
            SELECT id, deal_name, lead_source, data
            FROM zoho_deals
            LIMIT 50
        `);
        // We only care about deals that look like quality leads (originating lead created recently), but let's just see if source is populated.

        let dealsWithoutSource = 0;
        resDeals.rows.forEach(r => {
            const source = r.lead_source || r.data?.Lead_Source;
            if (!source) {
                dealsWithoutSource++;
                console.log(`[DEAL WITHOUT SOURCE] ID: ${r.id}, Name: ${r.deal_name}`);
            }
        });
        if (dealsWithoutSource === 0) console.log('All sampled deals have source.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
