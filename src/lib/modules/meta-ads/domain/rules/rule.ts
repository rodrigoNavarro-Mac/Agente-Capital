/**
 * Rule Interface
 */

import { RecommendationContext } from '../context/context';
import { RecommendationResult, RuleVersionID } from '../types';

export interface Rule {
    id: string;
    version: RuleVersionID;
    name: string;
    description: string;

    /**
     * Pure function to evaluate the rule.
     * MUST NOT use new Date() or external side effects.
     */
    evaluate(context: RecommendationContext): RecommendationResult | null;
}
