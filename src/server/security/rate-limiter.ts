/**
 * Production-Grade In-Memory Rate Limiter for Personal Intelligence API Endpoints.
 *
 * Implements a memory-safe sliding window log algorithm with automatic cleanup
 * of expired entries to prevent memory leaks in serverless/Node.js runtimes.
 *
 * Provides standard rate-limiting headers:
 * - X-RateLimit-Limit: Maximum allowed requests in window
 * - X-RateLimit-Remaining: Number of requests left in current window
 * - X-RateLimit-Reset: Epoch timestamp (in seconds) when quota resets
 * - Retry-After: Seconds until the client may retry
 */

import { NextResponse } from "next/server";

export interface RateLimitOptions {
  /** Maximum number of requests permitted within the window */
  limit: number;
  /** Window duration in milliseconds (default: 60,000ms = 1 minute) */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
}

interface WindowRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, WindowRecord>();
let cleanupInterval: NodeJS.Timeout | null = null;

// Periodically clean up entries with no timestamps in the last 10 minutes
function ensureCleanupTimer() {
  if (cleanupInterval || process.env.NODE_ENV === "test") return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const maxRetention = 10 * 60 * 1000;

    for (const [key, record] of rateLimitStore.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < maxRetention);
      if (record.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Extracts a client identifier from the request.
 * Prioritizes user ID (for authenticated routes), then forward headers, then falls back to localhost.
 */
export function getClientIdentifier(request: Request, userId?: string | null): string {
  if (userId && userId.trim().length > 0) {
    return `user:${userId.trim()}`;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return `ip:${firstIp}`;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp.trim()}`;

  return "ip:127.0.0.1";
}

/**
 * Checks whether an action by key is permitted under the given rate limit rule.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  ensureCleanupTimer();

  const limit = Math.max(1, options.limit);
  const windowMs = options.windowMs || 60 * 1000;
  const now = Date.now();
  const windowStart = now - windowMs;

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Filter timestamps within current window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  const count = record.timestamps.length;
  const oldestInWindow = record.timestamps[0] || now;
  const resetTimeMs = oldestInWindow + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

  if (count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetTimeMs,
      retryAfterSeconds,
    };
  }

  // Record this request timestamp
  record.timestamps.push(now);

  return {
    allowed: true,
    limit,
    remaining: limit - (count + 1),
    resetTimeMs,
    retryAfterSeconds: 0,
  };
}

/**
 * Builds HTTP response headers for rate limit feedback.
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(result.resetTimeMs / 1000)),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

/**
 * Generates a standard HTTP 429 Too Many Requests response.
 */
export function rateLimitExceededResponse(
  result: RateLimitResult,
  customMessage: string = "Too many requests. Please slow down and try again later."
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: customMessage,
      retryAfter: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: createRateLimitHeaders(result),
    }
  );
}

/**
 * Resets the in-memory rate limit store. Useful for testing suites.
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Preconfigured rate limits for Personal Intelligence API endpoints.
 */
export const RATE_LIMIT_CONFIGS = {
  // AI Generation & Deep Synthesis (strictly throttled to preserve quota)
  aiProcessing: { limit: 10, windowMs: 60 * 1000 },
  digestGeneration: { limit: 10, windowMs: 60 * 1000 },
  // Mutations: saving/unsaving bookmarks, updating topics
  mutations: { limit: 60, windowMs: 60 * 1000 },
  // Feed reading
  feedRead: { limit: 120, windowMs: 60 * 1000 },
  // Auth operations
  auth: { limit: 30, windowMs: 60 * 1000 },
} as const;
