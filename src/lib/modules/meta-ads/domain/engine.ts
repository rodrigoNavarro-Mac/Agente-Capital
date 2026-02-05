/**
 * Pure Recommendation Engine
 * 
 * The core deterministic function.
 */

import { RecommendationContext } from './context/context';
import { RecommendationResult, ConfigVersionID } from './types';
import { Rule } from './rules/rule';

// Defines what an "Active Config" looks like for the engine to execute
export interface ActiveEngineConfig {
    versionId: ConfigVersionID;
    rules: Rule[];
    // templates and profiles would be here in full implementation
}

/**
 * Purely evaluates a list of rules against a context.
 * 
 * @param context The immutable data snapshot
 * @param config The active configuration containing rules
 * @returns List of recommendations
 */
export function evaluate(
    context: RecommendationContext,
    config: ActiveEngineConfig
): RecommendationResult[] {
    const results: RecommendationResult[] = [];

    for (const rule of config.rules) {
        try {
            const result = rule.evaluate(context);
            if (result) {
                results.push(result);
            }
        } catch (error) {
            // Fail-safe: A rule throwing shouldn't crash the whole engine, 
            // but should probably be logged (in a pure way, we'd return an error result)
            // For now, we swallow and continue, or could return a "ERROR" action type.
            console.error(`Rule ${rule.id} failed:`, error);
        }
    }

    return results;
}
