/**
 * Zoho CRM Adapter (Read-Only)
 */

import { CrmPerformanceData } from '../../domain/context/context';

export interface ZohoAdapter {
    /**
     * Fetches CRM performance data for a given period.
     * Strictly read-only.
     */
    getPerformanceData(startDate: string, endDate: string, cid?: string): Promise<CrmPerformanceData>;
}

export class MockZohoAdapter implements ZohoAdapter {
    async getPerformanceData(startDate: string, endDate: string, cid?: string): Promise<CrmPerformanceData> {
        // Mock implementation for initial integration
        console.log(`[MockZohoAdapter] Fetching data from ${startDate} to ${endDate} ${cid ? `for CID: ${cid}` : '(All Campaigns)'}`);
        return {
            leadsGenerated: 15,
            qualifiedLeads: 5,
            dealsCreated: 2,
            dealsWon: 1,
            revenueGenerated: { amount: 50000, currency: 'MXN' }
        };
    }
}
