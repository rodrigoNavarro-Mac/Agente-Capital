/**
 * Meta Ads Adapter (Read-Only)
 */

import { AdPerformanceData } from '../../domain/context/context';

export interface MetaAdapter {
    /**
     * Fetches Ad performance metrics.
     * Strictly read-only.
     */
    getAdPerformance(adId: string, periodStart: string, periodEnd: string): Promise<AdPerformanceData>;
}

export class MockMetaAdapter implements MetaAdapter {
    async getAdPerformance(adId: string, periodStart: string, periodEnd: string): Promise<AdPerformanceData> {
        console.log(`[MockMetaAdapter] Fetching data for Ad ${adId}`);
        return {
            campaignId: 'cam_123',
            campaignName: 'Desarrollo_Merida_Leads_ENE',
            adSetId: 'aset_456',
            adSetName: 'Interests_Investors',
            adId: adId,
            adName: 'Ad_Image_Rendering_V1',
            spend: { amount: 1500, currency: 'MXN' },
            impressions: 4500,
            clicks: 120,
            cpc: { amount: 12.5, currency: 'MXN' },
            ctr: 2.66,
            periodStart,
            periodEnd
        };
    }
}
