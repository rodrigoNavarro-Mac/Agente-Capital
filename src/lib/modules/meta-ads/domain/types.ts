/**
 * Shared Domain Types for Meta Ads Recommendation Engine
 */

export type Currency = 'MXN' | 'USD';

export interface MonetaryValue {
  amount: number;
  currency: Currency;
}

export type ActionType =
  | 'PAUSE_CAMPAIGN'
  | 'PAUSE_AD_SET'
  | 'PAUSE_AD'
  | 'INCREASE_BUDGET'
  | 'DECREASE_BUDGET'
  | 'NO_ACTION';

export type EntityType = 'CAMPAIGN' | 'AD_SET' | 'AD';

export interface RecommendationAction {
  type: ActionType;
  entityType: EntityType;
  entityId: string;
  entityName: string; // Audit friendliness
  parameters?: Record<string, string | number>;
}

export interface RecommendationResult {
  action: RecommendationAction;
  reason: string;
  confidence: number; // 0.0 to 1.0 (Deterministic)
  ruleId: string;
  ruleVersion: string;
}

/**
 * Composite ID: {major}.{minor}.{hash}
 * Example: v1.0.a1b2c3d4
 */
export type ConfigVersionID = string;
export type RuleVersionID = string;
