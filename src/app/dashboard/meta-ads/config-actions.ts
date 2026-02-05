'use server';

import { query } from '@/lib/db/postgres';
import { revalidatePath } from 'next/cache';

export async function saveMetaToken(token: string, adAccountId?: string) {
    if (!token) {
        return { success: false, error: 'Token is empty' };
    }

    try {
        // 1. Lazy Migration: Ensure table exists
        await query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                updated_by TEXT
            );
        `);

        // 2. Upsert Token
        await query(`
            INSERT INTO system_settings (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE 
            SET value = $2, updated_at = NOW();
        `, ['META_ACCESS_TOKEN', token]);

        // 3. Upsert Ad Account ID if provided
        if (adAccountId) {
            await query(`
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (key) DO UPDATE 
                SET value = $2, updated_at = NOW();
            `, ['META_AD_ACCOUNT_ID', adAccountId]);
        }

        revalidatePath('/dashboard/meta-ads');
        return { success: true };
    } catch (error) {
        console.error('[ConfigAction] Failed to save token:', error);
        return { success: false, error: 'Database error' };
    }
}
