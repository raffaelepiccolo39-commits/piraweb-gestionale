/**
 * Rate limiter with in-memory store and TTL cleanup.
 *
 * NOTE: On Vercel serverless, each invocation may run in a separate isolate,
 * so this in-memory store only limits within a single instance. For production
 * at scale, replace with Upstash Redis (@upstash/ratelimit) or Vercel KV.
 *
 * This implementation provides:
 * - Automatic TTL cleanup every 60 seconds
 * - Composite key support (identifier + optional IP)
 * - Proper TypeScript types
 * - Middleware helper for easy use in API routes
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

const store = new Map<string, RateLimitEntry>();

/** Cleanup stale entries every 60 seconds to prevent memory leaks */
const CLEANUP_INTERVAL_MS = 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
    // If store is empty, stop the timer to allow GC in serverless
    if (store.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the process to exit even if the timer is still running
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Check whether a request is within the rate limit.
 *
 * @param identifier - Unique key for the rate limit bucket (e.g. `search:${userId}`)
 * @param config     - maxRequests and windowSeconds
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowSeconds * 1000;
    store.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the client IP from a Next.js request.
 * Uses x-forwarded-for (set by Vercel / reverse proxies) or falls back to
 * x-real-ip, then 'unknown'.
 */
export function getRequestIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Build a composite rate-limit key that includes the client IP.
 * This prevents a single user from bypassing limits by switching accounts
 * while on the same IP, and vice-versa.
 */
export function rateLimitKey(
  prefix: string,
  userId: string,
  request?: NextRequest,
): string {
  if (request) {
    const ip = getRequestIP(request);
    return `${prefix}:${userId}:${ip}`;
  }
  return `${prefix}:${userId}`;
}

/**
 * Middleware-style helper: checks rate limit and returns a 429 response
 * if exceeded, or null if the request is allowed.
 *
 * Usage in an API route:
 * ```ts
 * const blocked = applyRateLimit(request, `search:${user.id}`, { maxRequests: 15, windowSeconds: 3600 });
 * if (blocked) return blocked;
 * ```
 */
export function applyRateLimit(
  request: NextRequest,
  identifier: string,
  config: RateLimitConfig,
  errorMessage = 'Troppe richieste. Riprova tra qualche minuto.',
): NextResponse | null {
  const ip = getRequestIP(request);
  const key = `${identifier}:${ip}`;
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: errorMessage },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetAt),
        },
      },
    );
  }

  return null;
}

// ─── Pre-configured limits ───────────────────────────────────────────────────

/** AI endpoints: 20 requests per hour */
export const AI_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 20,
  windowSeconds: 3600,
};

/** Search/scraping endpoints: 15 requests per hour */
export const SEARCH_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 15,
  windowSeconds: 3600,
};
