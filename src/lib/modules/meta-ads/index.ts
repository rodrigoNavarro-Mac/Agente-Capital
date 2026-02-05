/**
 * Meta Ads Module Public API
 * 
 * Restricts access to internal types.
 */

export { MetaAdsFacade } from './application/facade';
export type { RecommendationResult, RecommendationAction } from './domain/types';
// Do NOT export internal domain/infrastructure types here.
