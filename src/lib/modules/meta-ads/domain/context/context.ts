/**
 * Input Context Definition
 * 
 * Defines the Read-Only data requirements for the engine.
 */

import { MonetaryValue } from '../types';

export interface AdPerformanceData {
    campaignId: string;
    campaignName: string;
    adSetId: string;
    adSetName: string;
    adId: string;
    adName: string;
    spend: MonetaryValue;
    impressions: number;
    clicks: number;
    cpc: MonetaryValue;
    ctr: number; // percentage 0-100
    periodStart: string; // ISO Date
    periodEnd: string; // ISO Date
}

export interface CrmPerformanceData {
    leadsGenerated: number;
    qualifiedLeads: number; // Disqualified leads excluded
    dealsCreated: number;
    dealsWon: number;
    revenueGenerated: MonetaryValue;
    // Correlation Keys
    utmCampaign?: string;
    utmContent?: string; // Ad ID usually
}

export interface CorrelationKeys {
    primary: {
        utmCampaign?: string;
        utmId?: string;
    };
    secondary: {
        leadSource?: string;
        campaignNamePrediction?: string;
    };
}

export interface RecommendationContext {
    adsData: AdPerformanceData;
    crmData: CrmPerformanceData;
    correlation: CorrelationKeys;
    // Explicitly injected time for determinism
    analysisTimestamp: string; // ISO Date string
}
