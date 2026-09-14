import { NextResponse } from "next/server";
import { runProductionCycle } from "@/server/jobs/run-production-cycle";
import { verifyCronAuthorization, cronUnauthorizedResponse } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";

async function handleProductionCycle(request: Request) {
  const auth = verifyCronAuthorization(request);
  if (!auth.authorized) {
    return cronUnauthorizedResponse(auth.reason);
  }

  // Parse optional execution flags if POST with body
  let options = {};
  if (request.method === "POST") {
    try {
      const raw = await request.json().catch(() => ({}));
      if (raw && typeof raw === "object") {
        if ("userId" in raw) {
          delete (raw as Record<string, unknown>).userId;
        }
        options = raw;
      }
    } catch {
      // Continue with default options
    }
  }

  const report = await runProductionCycle(options);

  return NextResponse.json(
    {
      success: report.success,
      ingestion: report.ingestion,
      ai: report.ai,
      digest: report.digest,
      durationMs: report.durationMs,
      errors: report.errors,
    },
    { status: report.success ? 200 : 207 }
  );
}

/**
 * POST /api/cron/production
 */
export async function POST(request: Request) {
  return handleProductionCycle(request);
}

/**
 * GET /api/cron/production (Required by Vercel Cron which invokes via GET)
 */
export async function GET(request: Request) {
  return handleProductionCycle(request);
}
