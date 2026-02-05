/**
 * Public Facade
 * 
 * The ONLY entry point for the rest of the application.
 */

import { RecommendationService } from './services/recommendation-service';
import { MockZohoAdapter } from '../infrastructure/zoho/adapter';
import { MockMetaAdapter } from '../infrastructure/meta/adapter';
import { FacebookGraphAdapter } from '../infrastructure/meta/graph-adapter';
import { MockConfigRepository, MockAuditRepository } from '../infrastructure/persistence/repos';
import { PostgresConfigRepository as RealConfigRepo, PostgresAuditRepository as RealAuditRepo } from '../infrastructure/persistence/postgres-repos';

// Composition Root
const useRealAdapters = process.env.USE_REAL_ADAPTERS === 'true';

const zohoAdapter = new MockZohoAdapter(); // Zoho Real Adapter not implemented yet
const metaAdapter = useRealAdapters
    ? new FacebookGraphAdapter(process.env.META_ACCESS_TOKEN || '')
    : new MockMetaAdapter();

const configRepo = useRealAdapters ? new RealConfigRepo() : new MockConfigRepository();
const auditRepo = useRealAdapters ? new RealAuditRepo() : new MockAuditRepository();

const service = new RecommendationService(
    zohoAdapter,
    metaAdapter,
    configRepo,
    auditRepo
);

export const MetaAdsFacade = {
    /**
     * Run analysis for a specific Ad ID.
     */
    analyzeAd: async (adId: string) => {
        return service.generateRecommendations(adId);
    }
};
