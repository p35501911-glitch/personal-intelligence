import { NextResponse } from "next/server";
import { runAiProcessingJob } from "@/server/jobs/ai-processing";
import { verifyCronAuthorization, cronUnauthorizedResponse } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";

async function handleAi(request: Request) {
  const auth = verifyCronAuthorization(request);
  if (!auth.authorized) {
    return cronUnauthorizedResponse(auth.reason);
  }

  let options = {};
  if (request.method === "POST") {
    try {
      const raw = await request.json().catch(() => ({}));
      if (raw && typeof raw === "object") {
        options = raw;
      }
    } catch {
      // Default
    }
  }

  const result = await runAiProcessingJob(options);

  return NextResponse.json({
    success: result.status === "completed" || result.status === "disabled",
    result,
  });
}

export async function POST(request: Request) {
  return handleAi(request);
}

export async function GET(request: Request) {
  return handleAi(request);
}
