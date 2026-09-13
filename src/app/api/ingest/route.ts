import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkerStatus, runIngestionCycle } from "@/server/news/worker";

const ingestBodySchema = z
  .object({
    providers: z.array(z.enum(["gdelt", "rss"])).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    force: z.boolean().optional(),
  })
  .optional();

/**
 * Validates request authorization against CRON_SECRET if configured.
 */
function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If no secret configured in environment, allow in dev/preview
    return true;
  }

  // 1. Check Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  // 2. Check query parameter ?secret=<token>
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  if (secretParam === cronSecret) return true;

  return false;
}

/**
 * GET /api/ingest
 *
 * Health check and telemetry endpoint returning current worker state,
 * active job status, and last run report.
 */
export async function GET() {
  const status = getWorkerStatus();
  return NextResponse.json({
    success: true,
    worker: status,
  });
}

/**
 * POST /api/ingest
 *
 * Trigger endpoint to run an end-to-end ingestion cycle.
 * Used by external schedulers (Vercel Cron, Supabase pg_cron, GitHub Actions)
 * or manual triggers.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Invalid or missing authorization secret.",
      },
      { status: 401 }
    );
  }

  // Parse optional body
  let options = {};
  try {
    const text = await request.text();
    if (text && text.trim().length > 0) {
      const parsedJson = JSON.parse(text);
      const validation = ingestBodySchema.safeParse(parsedJson);
      if (validation.success && validation.data) {
        options = {
          providers: validation.data.providers,
          limitPerProvider: validation.data.limit,
          force: validation.data.force,
        };
      }
    }
  } catch {
    // Non-fatal, use default options
  }

  const report = await runIngestionCycle(options);

  if (report.status === "already_running") {
    return NextResponse.json(
      {
        success: false,
        error: "An ingestion cycle is already in progress.",
        report,
      },
      { status: 429 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      report,
    },
    { status: 200 }
  );
}
