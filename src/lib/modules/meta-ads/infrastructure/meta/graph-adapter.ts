import { MetaAdapter } from './adapter';
import { AdPerformanceData } from '../../domain/context/context';
import { query } from '@/lib/db/postgres';

interface GraphInsightsResponse {
    data: {
        spend: string;
        impressions: string;
        clicks: string;
        cpc?: string;
        ctr?: string;
        ad_id: string;
        ad_name: string;
        campaign_id: string;
        campaign_name: string;
        adset_id: string;
        adset_name: string;
    }[];
}

export class FacebookGraphAdapter implements MetaAdapter {
    private accessToken: string;
    private baseUrl = 'https://graph.facebook.com/v19.0';

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    async getAdPerformance(adId: string, periodStart: string, periodEnd: string): Promise<AdPerformanceData> {
        let token = this.accessToken;

        if (!token) {
            try {
                // Lazy Load from DB
                const result = await query('SELECT value FROM system_settings WHERE key = $1', ['META_ACCESS_TOKEN']);
                if (result.rows.length > 0) {
                    token = result.rows[0].value;
                }
            } catch (error) {
                console.warn('[FacebookGraphAdapter] Failed to fetch token from DB:', error);
            }
        }

        if (!token) {
            throw new Error('Meta Access Token is missing (Env & DB).');
        }

        // Construct URL for Insights API
        const fields = 'spend,impressions,clicks,cpc,ctr,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name';
        const url = `${this.baseUrl}/${adId}/insights?fields=${fields}&time_range={'since':'${periodStart}','until':'${periodEnd}'}&access_token=${token}`;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Meta Graph API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const json: GraphInsightsResponse = await response.json();

            if (!json.data || json.data.length === 0) {
                console.warn(`[FacebookGraphAdapter] No insights found for Ad ${adId} in range ${periodStart}-${periodEnd}. Returning zeroes.`);
                // Return zeroed data if no insights exist for that period (common for new ads)
                return {
                    campaignId: 'unknown',
                    campaignName: 'unknown',
                    adSetId: 'unknown',
                    adSetName: 'unknown',
                    adId: adId,
                    adName: 'unknown',
                    spend: { amount: 0, currency: 'MXN' },
                    impressions: 0,
                    clicks: 0,
                    cpc: { amount: 0, currency: 'MXN' },
                    ctr: 0,
                    periodStart,
                    periodEnd
                };
            }

            // We take the first row (aggregated) because the API returns an array
            const data = json.data[0];

            return {
                campaignId: data.campaign_id,
                campaignName: data.campaign_name,
                adSetId: data.adset_id,
                adSetName: data.adset_name,
                adId: data.ad_id,
                adName: data.ad_name,
                spend: {
                    amount: parseFloat(data.spend || '0'),
                    currency: 'MXN' // Defaulting to MXN, ideally we fetch account currency too
                },
                impressions: parseInt(data.impressions || '0', 10),
                clicks: parseInt(data.clicks || '0', 10),
                cpc: {
                    amount: parseFloat(data.cpc || '0'),
                    currency: 'MXN'
                },
                ctr: parseFloat(data.ctr || '0'),
                periodStart,
                periodEnd
            };

        } catch (error) {
            console.error('[FacebookGraphAdapter] Failed to fetch metrics:', error);
            throw error;
        }
    }
}
