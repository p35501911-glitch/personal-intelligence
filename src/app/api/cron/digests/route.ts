import { NextResponse } from "next/server";
import { runDigestGenerationJob } from "@/server/jobs/digest-generation";
import { verifyCronAuthorization, cronUnauthorizedResponse } from "@/server/security/cron-auth";
import type { DigestPeriodType } from "@/server/news/digests/types";

export const dynamic = "force-dynamic";

async function handleDigests(request: Request) {
  const auth = verifyCronAuthorization(request);
  if (!auth.authorized) {
    return cronUnauthorizedResponse(auth.reason);
  }

  const url = new URL(request.url);
  const periodTypeParam = url.searchParams.get("periodType")?.toLowerCase();
  const periodType: DigestPeriodType = periodTypeParam === "weekly" ? "weekly" : "daily";

  let options: { userLimit?: number; force?: boolean } = {};
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
      // Continue with defaults
    }
  }

  const result = await runDigestGenerationJob({
    periodType,
    userLimit: options.userLimit,
    force: options.force,
  });

  return NextResponse.json({
    success: result.status === "completed" || result.status === "cached",
    result,
  });
}

export async function POST(request: Request) {
  return handleDigests(request);
}

export async function GET(request: Request) {
  return handleDigests(request);
}
