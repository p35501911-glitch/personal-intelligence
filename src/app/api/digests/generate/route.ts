import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateTopicDigest, runScheduledDigestGeneration } from "@/server/news/digests";
import {
  checkRateLimit,
  getClientIdentifier,
  RATE_LIMIT_CONFIGS,
  rateLimitExceededResponse,
  acquireUserActionLock,
  releaseUserActionLock,
} from "@/server/security/rate-limiter";

export const generateDigestBodySchema = z.object({
  periodType: z.enum(["daily", "weekly"]).default("daily"),
  force: z.boolean().optional().default(false),
  batch: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(50).optional().default(25),
});

/**
 * Validates request authorization against CRON_SECRET.
 */
function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  if (secretParam === cronSecret) return true;

  return false;
}

/**
 * POST /api/digests/generate
 *
 * Generates an executive intelligence briefing.
 * - For authenticated users: Generates or retrieves the briefing for the session user.
 * - For schedulers (authorized via CRON_SECRET): Executes batch generation for active users.
 */
export async function POST(request: Request) {
  try {
    const isCron = isCronAuthorized(request);

    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      // Empty body defaults to { periodType: "daily" }
      json = {};
    }

    // Also parse query parameters for cron convenience
    const url = new URL(request.url);
    const queryPeriod = url.searchParams.get("periodType");
    const queryBatch = url.searchParams.get("batch");

    if (queryPeriod && (queryPeriod === "daily" || queryPeriod === "weekly")) {
      (json as Record<string, unknown>).periodType = queryPeriod;
    }
    if (queryBatch === "true" || isCron) {
      (json as Record<string, unknown>).batch = true;
    }

    const validation = generateDigestBodySchema.safeParse(json);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { periodType, force, batch, limit } = validation.data;

    // Schedulers with CRON_SECRET can run batch digest generation
    if (isCron && batch) {
      const report = await runScheduledDigestGeneration({
        periodType,
        userLimit: limit,
        force,
      });

      return NextResponse.json({
        success: true,
        report,
      });
    }

    // User-triggered generation: Requires authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Enforce rate limiting per authenticated user
    const clientId = getClientIdentifier(request, user.id);
    const rateCheck = checkRateLimit(
      `digest:generate:${clientId}`,
      RATE_LIMIT_CONFIGS.digestGeneration
    );

    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(
        rateCheck,
        "Briefing generation rate limit exceeded. Please wait a moment before requesting another briefing."
      );
    }

    // In-flight concurrency lock: prevent user from firing duplicate simultaneous generations
    const inFlightKey = `digest:inflight:${user.id}:${periodType}`;
    if (!acquireUserActionLock(inFlightKey, 45000)) {
      return NextResponse.json(
        {
          success: false,
          error: "A briefing generation request is already in progress for your account. Please wait a moment.",
          retryAfter: 15,
        },
        { status: 429 }
      );
    }

    try {
      const result = await generateTopicDigest({
        userId: user.id,
        periodType,
        force,
        client: supabase,
      });

      return NextResponse.json(
        {
          success: true,
          digest: result.digest,
          generated: result.generated,
          source: result.source,
        },
        { status: result.generated ? 201 : 200 }
      );
    } finally {
      releaseUserActionLock(inFlightKey);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Digest Generate API] Error generating briefing:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
