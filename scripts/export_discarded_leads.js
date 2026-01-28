
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
    let pool;
    try {
        console.log('--- EXPORTING DISCARDED LEADS ---');

        // Configure connection
        const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

        if (!connectionString) {
            throw new Error('Connection string not found (POSTGRES_URL or DATABASE_URL)');
        }

        console.log('Connecting to database...');

        pool = new Pool({
            connectionString: connectionString,
            ssl: { rejectUnauthorized: false } // Required for Supabase/remote
        });

        // Define query using JSON fields
        // User clarification: "solo si esta como descartado o contacto no exitoso tenrera razon de descarte"
        const sqlQuery = `
            SELECT 
                full_name, 
                email, 
                phone, 
                data->>'Lead_Status' as lead_status, 
                data->>'Raz_n_de_descarte' as motivo_descarte,
                created_time,
                lead_source
            FROM zoho_leads 
            WHERE 
                (
                    data->>'Lead_Status' ILIKE '%descartado%' 
                    OR data->>'Lead_Status' ILIKE '%contacto no exit%'
                )
                AND
                (
                    data->>'Raz_n_de_descarte' ILIKE '%presupuesto%' 
                    OR data->>'Raz_n_de_descarte' ILIKE '%ilocalizable%' 
                    OR data->>'Raz_n_de_descarte' ILIKE '%no le gust%' 
                    OR data->>'Raz_n_de_descarte' ILIKE '%contacto no exit%'
                    OR data->>'Raz_n_de_descarte' ILIKE '%5 intentos%'
                    OR data->>'Raz_n_de_descarte' ILIKE '%no contesto%'
                )
            ORDER BY created_time DESC;
        `;

        console.log('Executing query...');
        const result = await pool.query(sqlQuery);
        console.log(`Found ${result.rowCount} leads matching both Status and Reason criteria.`);

        if (result.rowCount === 0) {
            console.log('No leads found matching both Status and Reason criteria.');
            console.log('Trying with ONLY Reason criteria (fallback)...');

            const fallbackQuery = `
                SELECT 
                    full_name, 
                    email, 
                    phone, 
                    data->>'Lead_Status' as lead_status, 
                    data->>'Raz_n_de_descarte' as motivo_descarte,
                    created_time,
                    lead_source
                FROM zoho_leads 
                WHERE 
                    data->>'Raz_n_de_descarte' ILIKE '%presupuesto%' 
                    OR data->>'Raz_n_de_descarte' ILIKE '%ilocalizable%' 
                    OR data->>'Raz_n_de_descarte' ILIKE '%no le gust%' 
                    OR data->>'Raz_n_de_descarte' ILIKE '%contacto no exit%'
                    OR data->>'Raz_n_de_descarte' ILIKE '%5 intentos%'
                    OR data->>'Raz_n_de_descarte' ILIKE '%no contesto%'
                ORDER BY created_time DESC;
            `;
            const fallbackResult = await pool.query(fallbackQuery);
            console.log(`Found ${fallbackResult.rowCount} leads with ONLY Reason criteria.`);

            if (fallbackResult.rowCount > 0) {
                console.log('Exporting fallback results.');
                processResults(fallbackResult.rows);
                return;
            }
        }

        processResults(result.rows);

    } catch (error) {
        console.error('Error exporting leads:', error);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

function processResults(rows) {
    // Convert to CSV
    const headers = ['Full Name', 'Email', 'Phone', 'Status', 'Discard Reason', 'Created Time', 'Source'];
    const csvRows = [headers.join(',')];

    for (const row of rows) {
        const values = [
            escapeCsv(row.full_name),
            escapeCsv(row.email),
            escapeCsv(row.phone),
            escapeCsv(row.lead_status),
            escapeCsv(row.motivo_descarte),
            escapeCsv(row.created_time ? new Date(row.created_time).toISOString() : ''),
            escapeCsv(row.lead_source)
        ];
        csvRows.push(values.join(','));
    }

    const csvContent = csvRows.join('\n');

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `discarded_leads_${timestamp}.csv`;
    const outputPath = path.join(process.cwd(), filename);

    fs.writeFileSync(outputPath, csvContent, 'utf8');
    console.log(`Successfully exported leads to: ${outputPath}`);
}

function escapeCsv(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const stringValue = String(value);
    // Escape quotes and wrap in quotes if contains comma, quote or newline
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

main();
