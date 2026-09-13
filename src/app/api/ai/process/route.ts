import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAiEnabled,
  isGeminiConfigured,
  getFlashLiteModel,
  getFlashModel,
} from "@/server/ai/client";
import { processPendingStoryIntelligence } from "@/server/ai/pipeline";

const aiProcessBodySchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
    force: z.boolean().optional(),
  })
  .optional();

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }

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

export async function GET() {
  return NextResponse.json({
    success: true,
    enabled: isAiEnabled(),
    configured: isGeminiConfigured(),
    models: {
      flashLite: getFlashLiteModel(),
      flash: getFlashModel(),
    },
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Invalid or missing secret" },
      { status: 401 }
    );
  }

  if (!isAiEnabled()) {
    return NextResponse.json({
      success: true,
      enabled: false,
      message: "AI processing is disabled via AI_ENABLED=false",
      processed: 0,
      normal: 0,
      important: 0,
      failed: 0,
      rateLimited: false,
    });
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "GEMINI_API_KEY is not configured in server environment",
        processed: 0,
        normal: 0,
        important: 0,
        failed: 0,
        rateLimited: false,
      },
      { status: 503 }
    );
  }

  let limit = 10;
  let force = false;

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = aiProcessBodySchema.safeParse(rawBody);
    if (parsed.success && parsed.data) {
      if (parsed.data.limit) limit = parsed.data.limit;
      if (parsed.data.force !== undefined) force = parsed.data.force;
    }
  } catch {
    // Continue with defaults
  }

  const stats = await processPendingStoryIntelligence({
    limit,
    forceRegenerate: force,
  });

  return NextResponse.json({
    success: true,
    processed: stats.processed,
    normal: stats.normal,
    important: stats.important,
    succeeded: stats.succeeded,
    failed: stats.failed,
    skipped: stats.skipped,
    rateLimited: stats.rateLimited,
    durationMs: stats.durationMs,
  });
}
