'use server';

import { PostgresAuditRepository, PostgresConfigRepository } from '@/lib/modules/meta-ads/infrastructure/persistence/postgres-repos';
import { AuditLogEntry } from '@/lib/modules/meta-ads/infrastructure/persistence/repos';

const auditRepo = new PostgresAuditRepository();

export async function getMetaAdsLogs(limit: number = 50): Promise<AuditLogEntry[]> {
    try {
        return await auditRepo.getRecentLogs(limit);
    } catch (error) {
        console.error('Error fetching meta ads logs:', error);
        return [];
    }
}

const configRepo = new PostgresConfigRepository();

export async function getEngineConfig() {
    try {
        const config = await configRepo.getActiveConfig();
        // Transform for UI if needed, but returning full object is fine for now
        // We might want to strip complex objects if they aren't serializable, 
        // but Rule objects with methods won't serialize well over Server Actions unless we map them.
        return {
            versionId: config.versionId,
            rules: config.rules.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description,
                version: r.version
            }))
        };
    } catch (error) {
        console.error('Error fetching engine config:', error);
        return null;
    }
}
