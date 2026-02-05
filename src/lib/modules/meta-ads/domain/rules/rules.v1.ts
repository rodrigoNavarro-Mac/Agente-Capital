/**
 * Concrete Rules - Version 1
 */

import { Rule } from './rule';
import { RecommendationContext } from '../context/context';
import { RecommendationResult } from '../types';

export const HighCpaRule: Rule = {
    id: 'rule-high-cpa',
    version: '1.0.0', // Semantic versioning for the rule logic itself
    name: 'High CPA Guardrail',
    description: 'Pauses Ad Set if CPA exceeds 2x the target threshold.',

    evaluate(context: RecommendationContext): RecommendationResult | null {
        const { adsData, crmData } = context;

        // Guard: Need spend and leads to calculate CPA
        if (adsData.spend.amount <= 0) return null;

        // Deterministic Logic
        // If no leads, use 1 to avoid division by zero (or handle as special case)
        // Here we treat 0 leads as potentially infinite CPA, so we check spend vs absolute threshold

        const leads = crmData.leadsGenerated;
        const spend = adsData.spend.amount;

        const TARGET_CPA = 150.00; // Hardcoded in V1, movable to Template/Config later
        const THRESHOLD_MULTIPLIER = 2.0;

        const calculatedCpa = leads > 0 ? spend / leads : spend; // If 0 leads, CPA is effectively the Spend

        if (calculatedCpa > (TARGET_CPA * THRESHOLD_MULTIPLIER)) {
            return {
                action: {
                    type: 'PAUSE_AD_SET',
                    entityType: 'AD_SET',
                    entityId: adsData.adSetId,
                    entityName: adsData.adSetName,
                    parameters: { currentCpa: calculatedCpa, targetCpa: TARGET_CPA }
                },
                reason: `CPA (${calculatedCpa.toFixed(2)}) exceeds 2x target (${TARGET_CPA}).`,
                confidence: 1.0,
                ruleId: 'rule-high-cpa',
                ruleVersion: '1.0.0'
            };
        }

        return null;
    }
};

export const ZeroLeadsHighSpendRule: Rule = {
    id: 'rule-zero-leads-high-spend',
    version: '1.0.0',
    name: 'Zero Leads Safety Net',
    description: 'Pauses Ad if spend > $500 with 0 leads.',

    evaluate(context: RecommendationContext): RecommendationResult | null {
        const { adsData, crmData } = context;

        const SPEND_LIMIT = 500.00;

        if (crmData.leadsGenerated === 0 && adsData.spend.amount > SPEND_LIMIT) {
            return {
                action: {
                    type: 'PAUSE_AD',
                    entityType: 'AD',
                    entityId: adsData.adId,
                    entityName: adsData.adName,
                    parameters: { spend: adsData.spend.amount, limit: SPEND_LIMIT }
                },
                reason: `Ad spent $${adsData.spend.amount} with 0 leads.`,
                confidence: 1.0,
                ruleId: 'rule-zero-leads-high-spend',
                ruleVersion: '1.0.0'
            };
        }

        return null;
    }
};
