/**
 * Recommendation Service (Orchestrator)
 * 
 * Coordinates the flow:
 * 1. Build Context
 * 2. Create Snapshot
 * 3. Fetch Active Config
 * 4. Run Pure Engine
 * 5. Audit Log
 */

import { v4 as uuidv4 } from 'uuid';
import { createSnapshot } from '../../domain/context/snapshot';
import { RecommendationContext } from '../../domain/context/context';
import { evaluate } from '../../domain/engine';
import { RecommendationResult } from '../../domain/types';
import { ZohoAdapter } from '../../infrastructure/zoho/adapter';
import { MetaAdapter } from '../../infrastructure/meta/adapter';
import { ConfigRepository, AuditRepository } from '../../infrastructure/persistence/repos';

// Correlation Helper (Simple V1)
// In a real scenario, this would be a full class in /application/services/context-builder.ts
async function buildContext(
    zoho: ZohoAdapter,
    meta: MetaAdapter,
    adId: string // Scope of analysis
): Promise<RecommendationContext> {
    const now = new Date();
    const periodEnd = now.toISOString().split('T')[0];
    const periodStart = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0]; // Last 30 days

    // 3. Sequential fetch to enable aggregation by CID (Meta -> Zoho)
    // We first need the Meta Campaign ID to filter Zoho data.
    const adsData = await meta.getAdPerformance(adId, periodStart, periodEnd);

    // Now fetch Zoho data specifically for this Campaign ID (CID)
    const crmData = await zoho.getPerformanceData(periodStart, periodEnd, adsData.campaignId);

    return {
        // ... (rest of the context)
        analysisTimestamp: new Date().toISOString(),
        adsData,
        crmData,
        correlation: {
            primary: { utmCampaign: adsData.campaignName },
            secondary: {}
        }
    };
}

export class RecommendationService {
    constructor(
        private zohoAdapter: ZohoAdapter,
        private metaAdapter: MetaAdapter,
        private configRepo: ConfigRepository,
        private auditRepo: AuditRepository
    ) { }

    /**
     * Generates recommendations for a specific Ad.
     */
    async generateRecommendations(adId: string): Promise<RecommendationResult[]> {
        // 1. Build Context (with correlation)
        const context = await buildContext(this.zohoAdapter, this.metaAdapter, adId);

        // 2. Freeze Snapshot (Audit Safety)
        const snapshot = createSnapshot(context);

        // 3. Get Active Config
        const config = await this.configRepo.getActiveConfig();

        // 4. Execute PURE Engine
        // Note: providing config.versionId to the engine if needed, but the engine is pure logic
        const results = evaluate(context, config);

        // 5. Audit Log (Side Effect)
        await this.auditRepo.saveLog({
            id: uuidv4(),
            generatedAt: new Date().toISOString(),
            configVersion: config.versionId,
            contextHash: snapshot.id,
            contextSnapshot: snapshot,
            recommendations: results
        });

        return results;
    }
}
