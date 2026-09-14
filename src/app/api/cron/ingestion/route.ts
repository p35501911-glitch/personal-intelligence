import { NextResponse } from "next/server";
import { runNewsIngestionJob } from "@/server/jobs/news-ingestion";
import { verifyCronAuthorization, cronUnauthorizedResponse } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";

async function handleIngestion(request: Request) {
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

  const result = await runNewsIngestionJob(options);

  return NextResponse.json({
    success: result.status === "completed" || result.status === "partial",
    result,
  });
}

export async function POST(request: Request) {
  return handleIngestion(request);
}

export async function GET(request: Request) {
  return handleIngestion(request);
}
