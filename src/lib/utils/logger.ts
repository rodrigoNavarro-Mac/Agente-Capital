/**
 * Minimal logger with levels.
 *
 * Goal:
 * - In production, avoid noisy debug logs by default.
 * - Still log warnings/errors to help diagnose incidents.
 *
 * Configuration:
 * - LOG_LEVEL (server only): "debug" | "info" | "warn" | "error" | "silent"
 * - NODE_ENV fallback:
 *   - production => "warn"
 *   - otherwise  => "debug"
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<Exclude<LogLevel, 'silent'>, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLevel(value: unknown): LogLevel | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error' || v === 'silent') return v;
  return undefined;
}

function getConfiguredLevel(): LogLevel {
  // LOG_LEVEL should be server-only. Avoid reading it in the browser bundle.
  if (typeof window === 'undefined') {
    const envLevel = normalizeLevel(process.env.LOG_LEVEL);
    if (envLevel) return envLevel;
  }

  // NODE_ENV exists on both server and client (Next.js replaces it at build time).
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === 'production' ? 'warn' : 'debug';
}

function shouldLog(level: Exclude<LogLevel, 'silent'>): boolean {
  const configured = getConfiguredLevel();
  if (configured === 'silent') return false;
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[configured];
}

function safeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;

  // Avoid logging secrets by default.
  const blockedKeys = new Set(['password', 'token', 'accessToken', 'refreshToken', 'authorization', 'apiKey']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = blockedKeys.has(k) ? '[REDACTED]' : v;
  }
  return out;
}

function formatPrefix(scope?: string): string {
  return scope ? `[app:${scope}]` : '[app]';
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>, scope?: string) {
    if (!shouldLog('debug')) return;
    // eslint-disable-next-line no-console
    console.debug(formatPrefix(scope), message, safeContext(context) ?? '');
  },
  info(message: string, context?: Record<string, unknown>, scope?: string) {
    if (!shouldLog('info')) return;
    // eslint-disable-next-line no-console
    console.info(formatPrefix(scope), message, safeContext(context) ?? '');
  },
  warn(message: string, context?: Record<string, unknown>, scope?: string) {
    if (!shouldLog('warn')) return;
    // eslint-disable-next-line no-console
    console.warn(formatPrefix(scope), message, safeContext(context) ?? '');
  },
  error(message: string, err?: unknown, context?: Record<string, unknown>, scope?: string) {
    if (!shouldLog('error')) return;
    const errorContext = safeContext(context);

    if (err instanceof Error) {
      // eslint-disable-next-line no-console
      console.error(formatPrefix(scope), message, { ...errorContext, name: err.name, message: err.message, stack: err.stack });
      return;
    }

    // eslint-disable-next-line no-console
    console.error(formatPrefix(scope), message, { ...errorContext, err });
  },
};


