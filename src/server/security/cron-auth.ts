/**
 * Production Cron Security & Authentication Helper
 *
 * Verifies that scheduled requests originating from Vercel Cron, Supabase pg_cron,
 * or GitHub Actions present a valid CRON_SECRET token.
 *
 * Security Invariants:
 * - Constant-time token verification prevents timing attacks.
 * - Rejects any client-supplied userId.
 * - Never returns or leaks CRON_SECRET in responses or error logs.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";

/**
 * Validates request authorization against CRON_SECRET.
 */
export function verifyCronAuthorization(request: Request): { authorized: boolean; reason?: string } {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("auth_failure", "CRON_SECRET is not configured in production environment!");
      return { authorized: false, reason: "CRON_SECRET not configured on server" };
    }
    // In local development or test mode without CRON_SECRET, permit execution
    return { authorized: true };
  }

  // 1. Check Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (safeCompare(token, cronSecret)) {
      return { authorized: true };
    }
  }

  // 2. Check query parameter ?secret=<token>
  try {
    const url = new URL(request.url);
    const secretParam = url.searchParams.get("secret");
    if (secretParam && safeCompare(secretParam, cronSecret)) {
      return { authorized: true };
    }
  } catch {
    // Malformed URL
  }

  logger.warn("auth_failure", "Unauthorized cron invocation rejected", {
    extra: {
      hasAuthHeader: Boolean(authHeader),
      ip: request.headers.get("x-forwarded-for") || "unknown",
    },
  });

  return { authorized: false, reason: "Invalid or missing cron secret" };
}

/**
 * Constant-time comparison between candidate and expected secret strings.
 */
function safeCompare(candidate: string, expected: string): boolean {
  try {
    const bufA = Buffer.from(candidate, "utf8");
    const bufB = Buffer.from(expected, "utf8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Helper to construct an HTTP 401 Unauthorized response for cron endpoints.
 */
export function cronUnauthorizedResponse(reason = "Unauthorized: Invalid or missing authorization secret."): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: reason,
    },
    { status: 401 }
  );
}
