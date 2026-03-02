/**
 * =====================================================
 * WHATSAPP CONVERSATIONS - ACCESS CONTROL BY ROLE
 * =====================================================
 * Shared authorization for conversations list, logs, and retry/resend actions.
 * Admin/CEO: full access. Sales manager: only allowed developments (can_query).
 */

import type { JWTPayload } from '@/lib/auth/auth';
import { getUserDevelopments } from '@/lib/db/postgres';

const FULL_ACCESS_ROLES = ['admin', 'ceo'];
const ALLOWED_ROLES = ['admin', 'ceo', 'sales_manager'];

function normalizeDevelopment(value: string): string {
    return value.trim().toLowerCase();
}

export function isAllowedRole(role?: string): boolean {
    return !!role && ALLOWED_ROLES.includes(role);
}

export function hasFullAccess(role?: string): boolean {
    return !!role && FULL_ACCESS_ROLES.includes(role);
}

export interface ConversationAccessOptions {
    /** Allowed development names (null = all for admin/ceo) */
    allowedDevelopments: string[] | null;
    /** User email for "my leads" filter */
    userEmail: string;
    /** Whether user has full access (admin/ceo) */
    fullAccess: boolean;
}

/**
 * Get access options for the current user (role + allowed developments).
 * Used by GET /conversations to build filters.
 */
export async function getConversationAccessOptions(payload: JWTPayload): Promise<ConversationAccessOptions | null> {
    if (!payload?.userId || !isAllowedRole(payload.role)) {
        return null;
    }
    const fullAccess = hasFullAccess(payload.role);
    if (fullAccess) {
        return {
            allowedDevelopments: null,
            userEmail: payload.email ?? '',
            fullAccess: true,
        };
    }
    const devs = await getUserDevelopments(payload.userId);
    const allowed = devs
        .filter((d) => d.can_query)
        .map((d) => normalizeDevelopment(d.development))
        .filter((d) => d.length > 0);
    return {
        allowedDevelopments: allowed.length > 0 ? Array.from(new Set(allowed)) : [],
        userEmail: payload.email ?? '',
        fullAccess: false,
    };
}

/**
 * Check if the user can access a specific conversation (by development).
 * Used by logs and retry/resend endpoints. Admin/ceo: always true.
 * Sales manager: true only if development is in their allowed list.
 */
export async function canAccessConversation(
    payload: JWTPayload,
    development: string
): Promise<boolean> {
    if (!payload?.userId || !isAllowedRole(payload.role)) {
        return false;
    }
    if (hasFullAccess(payload.role)) {
        return true;
    }
    const opts = await getConversationAccessOptions(payload);
    if (!opts?.allowedDevelopments?.length) {
        return false;
    }
    return opts.allowedDevelopments.includes(normalizeDevelopment(development));
}
