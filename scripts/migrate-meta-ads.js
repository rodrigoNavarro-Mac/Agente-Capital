
const path = require('path');
const fs = require('fs');

// Try loading .env.local, fallback to .env
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

const { Pool } = require('pg');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
console.log('DB Connection:', connectionString ? 'Loaded' : 'Missing');

if (!connectionString) {
    console.error('ERROR: No database connection string found.');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log('Running Meta Ads Migration...');
    const schemaPath = path.resolve(__dirname, '../src/lib/modules/meta-ads/infrastructure/persistence/schema.sql');

    if (!fs.existsSync(schemaPath)) {
        console.error('Schema file not found:', schemaPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('Applying schema from:', schemaPath);

    try {
        await pool.query(sql);
        console.log('Migration successful!');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}

migrate();
