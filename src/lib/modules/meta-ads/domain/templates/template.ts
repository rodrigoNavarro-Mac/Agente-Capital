/**
 * Campaign Templates
 * 
 * Defines the standard structure for campaigns to ensure governance.
 */

import { MonetaryValue } from '../types';

export interface CampaignTemplate {
    id: string;
    name: string;
    platform: 'META' | 'GOOGLE'; // Extensible
    objective: 'LEADS' | 'SALES' | 'TRAFFIC';

    // Governance Defaults
    defaultDailyBudget: MonetaryValue;
    maxDailyBudget: MonetaryValue;
    minDailyBudget: MonetaryValue;

    // Naming Convention (Regex)
    namingConventionRegex: string;

    // Required Tracking parameters
    requiredUrlParameters: string[]; // e.g., ['utm_source', 'utm_campaign']

    version: string;
}

export const StandardLeadGenTemplate: CampaignTemplate = {
    id: 'tpl-lead-gen-v1',
    name: 'Standard Lead Generation',
    platform: 'META',
    objective: 'LEADS',
    defaultDailyBudget: { amount: 200, currency: 'MXN' },
    maxDailyBudget: { amount: 2000, currency: 'MXN' },
    minDailyBudget: { amount: 100, currency: 'MXN' },
    namingConventionRegex: '^PROP_[A-Z0-9]+_(LEADS|SALES)_[A-Z]{3}$',
    requiredUrlParameters: ['utm_source', 'utm_medium', 'utm_campaign'],
    version: '1.0.0'
};
