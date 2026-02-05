
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// 1. Try loading .env.local, fallback to .env
let envPath = path.resolve(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
    console.log('.env.local not found, checking .env...');
    envPath = path.resolve(__dirname, '../.env');
}

if (fs.existsSync(envPath)) {
    console.log('Loading .env from:', envPath);
    require('dotenv').config({ path: envPath });
} else {
    console.warn('WARNING: No .env file found.');
}

// 2. Setup DB Pool
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
console.log('DB Connection String:', connectionString ? 'Loaded (Hidden)' : 'Missing');

if (!connectionString) {
    console.error('ERROR: POSTGRES_URL or DATABASE_URL is missing.');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function verifyAd(adId) {
    let token = process.env.META_ACCESS_TOKEN;
    console.log('Env Token:', token ? 'Present' : 'Missing');

    // 3. Fallback to DB
    if (!token) {
        console.log('Token not in .env, checking DB...');
        try {
            const res = await pool.query("SELECT value FROM system_settings WHERE key = 'META_ACCESS_TOKEN'");
            if (res.rows.length > 0) {
                token = res.rows[0].value;
                console.log('Token found in DB.');
            } else {
                console.log('Token NOT found in DB system_settings.');
            }
        } catch (dbErr) {
            console.error('DB Query Error:', dbErr.message);
        }
    }

    if (!token) {
        console.error('ERROR: No Access Token found in .env or DB.');
        process.exit(1);
    }

    console.log(`Analyzing Ad ID: ${adId}`);

    // 30 days ago
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Check Permissions (Ad Accounts)
    // Sometimes permissions issue manifests as empty data or error

    const fields = 'spend,impressions,clicks,cpc,ctr,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name';
    const url = `https://graph.facebook.com/v19.0/${adId}/insights?fields=${fields}&time_range={'since':'${start}','until':'${end}'}&access_token=${token}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (json.error) {
            console.error('Meta Ad API Error:', JSON.stringify(json.error, null, 2));
        } else {
            console.log('SUCCESS! Data retrieved:');
            console.log(JSON.stringify(json.data[0] || { message: 'No metrics for this period, but API call succeeded.' }, null, 2));
        }
    } catch (e) {
        console.error('Fetch Error:', e);
    } finally {
        await pool.end();
    }
}

const adId = process.argv[2];
if (!adId) {
    console.error('Please provide Ad ID');
    process.exit(1);
}

verifyAd(adId);
