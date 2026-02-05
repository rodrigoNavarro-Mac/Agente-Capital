/**
 * Persistence Repositories
 */

import { ActiveEngineConfig } from '../../domain/engine';
import { ContextSnapshot } from '../../domain/context/snapshot';
import { RecommendationResult, ConfigVersionID } from '../../domain/types';

// ==========================================
// Config Repository
// ==========================================

export interface ConfigRepository {
    getActiveConfig(): Promise<ActiveEngineConfig>;
    // For governance:
    // saveConfig(config: EngineConfig): Promise<void>;
}

export class MockConfigRepository implements ConfigRepository {
    async getActiveConfig(): Promise<ActiveEngineConfig> {
        // Return a hardcoded "Active" config for now
        // In real impl, this reads from meta_ads_configs table where status = 'ACTIVE'
        const { HighCpaRule, ZeroLeadsHighSpendRule } = await import('../../domain/rules/rules.v1');

        return {
            versionId: 'config-v1.0.mock',
            rules: [HighCpaRule, ZeroLeadsHighSpendRule]
        };
    }
}

// ==========================================
// Audit Repository
// ==========================================

export interface AuditLogEntry {
    id: string; // uuid
    generatedAt: string; // ISO
    configVersion: ConfigVersionID;
    contextHash: string;
    contextSnapshot: ContextSnapshot; // JSONB
    recommendations: RecommendationResult[]; // JSONB
}

export interface AuditRepository {
    saveLog(entry: AuditLogEntry): Promise<void>;
    getRecentLogs(limit: number): Promise<AuditLogEntry[]>;
}

export class MockAuditRepository implements AuditRepository {
    async saveLog(entry: AuditLogEntry): Promise<void> {
        console.log(`[MockAuditRepository] 📝 Saving Audit Log: ${entry.id}`);
        console.log(`  > Version: ${entry.configVersion}`);
        console.log(`  > ContextHash: ${entry.contextHash}`);
        console.log(`  > Recommendations: ${entry.recommendations.length}`);
    }

    async getRecentLogs(_limit: number): Promise<AuditLogEntry[]> {
        return [
            {
                id: 'mock-log-1',
                generatedAt: new Date().toISOString(),
                configVersion: 'v1.mock',
                contextHash: 'hash1',
                contextSnapshot: {} as any,
                recommendations: []
            }
        ];
    }
}
