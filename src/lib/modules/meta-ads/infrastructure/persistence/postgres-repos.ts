/**
 * Real Postgres Repositories
 */

import { query } from '@/lib/db/postgres';
import { ActiveEngineConfig } from '../../domain/engine';
import { ConfigRepository, AuditRepository, AuditLogEntry } from './repos';
import { HighCpaRule, ZeroLeadsHighSpendRule } from '../../domain/rules/rules.v1';

export class PostgresConfigRepository implements ConfigRepository {
    async getActiveConfig(): Promise<ActiveEngineConfig> {
        try {
            // Fetch the LATEST config from DB
            const result = await query(
                `SELECT * FROM meta_ads_configs 
                 ORDER BY created_at DESC 
                 LIMIT 1`
            );

            if (result.rows.length > 0) {
                const row = result.rows[0];
                return {
                    versionId: row.config_version,
                    // In a full system, we would hydrate rules from row.payload or a rule registry
                    // For now, we enforce the V1 ruleset but allow the DB to track the "active version" ID
                    rules: [HighCpaRule, ZeroLeadsHighSpendRule]
                };
            }

            // Fallback if no config exists yet
            return {
                versionId: 'v1.0.0-default',
                rules: [HighCpaRule, ZeroLeadsHighSpendRule]
            };
        } catch (error) {
            console.error('[PostgresConfigRepo] Failed to fetch config, using default:', error);
            return {
                versionId: 'v1.0.0-fallback',
                rules: [HighCpaRule, ZeroLeadsHighSpendRule]
            };
        }
    }
}

export class PostgresAuditRepository implements AuditRepository {
    async saveLog(entry: AuditLogEntry): Promise<void> {
        try {
            await query(
                `INSERT INTO meta_ads_audit_logs (
                  id,
                  generated_at,
                  config_version,
                  config_hash,
                  context_hash,
                  context_snapshot,
                  recommendations
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    entry.id,
                    entry.generatedAt,
                    entry.configVersion,
                    'hash-placeholder', // We should prob pass this in entry or calculate it
                    entry.contextHash,
                    entry.contextSnapshot,
                    JSON.stringify(entry.recommendations)
                ]
            );
            console.log(`[PostgresAuditRepo] Audit Log saved: ${entry.id}`);
        } catch (error) {
            console.error('[PostgresAuditRepo] Failed to save audit log:', error);
            // We might want to rethrow or fallback to file log
            throw error;
        }
    }

    async getRecentLogs(limit: number): Promise<AuditLogEntry[]> {
        try {
            const result = await query<any>(
                `SELECT * FROM meta_ads_audit_logs 
                 ORDER BY generated_at DESC 
                 LIMIT $1`,
                [limit]
            );

            return result.rows.map(row => ({
                id: row.id,
                generatedAt: row.generated_at,
                configVersion: row.config_version,
                contextHash: row.context_hash,
                contextSnapshot: row.context_snapshot, // Postgres driver auto-parses JSON
                recommendations: typeof row.recommendations === 'string'
                    ? JSON.parse(row.recommendations)
                    : row.recommendations
            }));
        } catch (error) {
            console.error('[PostgresAuditRepo] Failed to fetch logs:', error);
            return [];
        }
    }
}
