/**
 * Context Snapshot Logic
 * 
 * Ensures input data is immutable and hashable for audit trails.
 */

import crypto from 'crypto';
import { RecommendationContext } from './context';

export interface ContextSnapshot {
    id: string; // Hash of the content
    payload: RecommendationContext;
    createdAt: string; // ISO Timestamp of creation
}

/**
 * Creates a deterministic hash of the context.
 * Uses JSON.stringify with sorted keys to ensure consistent ordering.
 */
function hashContext(context: RecommendationContext): string {
    // Simple deterministic stringify
    const canonicalString = JSON.stringify(context, Object.keys(context).sort());
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Freezes the context into an immutable snapshot.
 */
export function createSnapshot(context: RecommendationContext): ContextSnapshot {
    // Deep clone to ensure immutability of the payload
    const payloadClone = JSON.parse(JSON.stringify(context));

    // Hash calculation
    const hash = hashContext(payloadClone);

    const snapshot: ContextSnapshot = {
        id: hash,
        payload: payloadClone,
        createdAt: new Date().toISOString() // Snapshot creation time (System time OK here, as it's metadata)
    };

    // Enforce runtime immutability
    return Object.freeze(snapshot);
}
