/**
 * Script para ejecutar migration 037 manualmente
 */

import { query } from '@/lib/db/postgres';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
    try {
        console.log('Reading migration file...');
        const migrationPath = path.join(process.cwd(), 'migrations', '037_whatsapp_conversations.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executing migration 037_whatsapp_conversations.sql...');
        await query(sql, []);

        console.log('✅ Migration executed successfully!');
        console.log('Table whatsapp_conversations created with indexes and triggers');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
