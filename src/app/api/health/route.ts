import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/server/supabase";
import { getWorkerStatus } from "@/server/news/worker";
import {
  isAiEnabled,
  isGeminiConfigured,
  getFlashLiteModel,
  getFlashModel,
  isDeepAnalysisEnabled,
} from "@/server/ai/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight production health and observability endpoint.
 *
 * Security Invariant:
 * Never exposes API keys, service role tokens, credentials, or internal secret material.
 * Zero Gemini API calls are made from this health check.
 */
export async function GET() {
  const startTime = performance.now();
  let dbConnected = false;
  let dbLatencyMs = 0;
  let dbError: string | null = null;

  // 1. Check Database Connectivity (lightweight ping)
  try {
    const dbStart = performance.now();
    const client = getServiceSupabaseClient();
    const { error } = await client
      .from("categories")
      .select("id")
      .limit(1);

    dbLatencyMs = Math.round(performance.now() - dbStart);

    if (error) {
      dbError = error.message;
    } else {
      dbConnected = true;
    }
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  // 2. Worker Telemetry
  const workerStatus = getWorkerStatus();

  // 3. AI Pipeline Telemetry (Sanitized)
  const aiEnabled = isAiEnabled();
  const aiConfigured = isGeminiConfigured();
  const aiStatus = {
    enabled: aiEnabled,
    configured: aiConfigured,
    deepAnalysisEnabled: isDeepAnalysisEnabled(),
    models: {
      flashLite: getFlashLiteModel(),
      flash: getFlashModel(),
    },
  };

  // 4. System Telemetry (Safe operational metrics)
  const systemStatus = {
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    environment: process.env.NODE_ENV || "development",
  };

  const isHealthy = dbConnected;
  const overallLatencyMs = Math.round(performance.now() - startTime);

  const payload = {
    status: isHealthy ? "ok" : "degraded",
    database: dbConnected ? "ok" : "error",
    ai: aiEnabled ? (aiConfigured ? "enabled" : "unconfigured") : "disabled",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    latencyMs: overallLatencyMs,
    databaseDetails: {
      connected: dbConnected,
      latencyMs: dbLatencyMs,
      ...(dbError ? { error: "Database query failed" } : {}),
    },
    ingestion: {
      status: workerStatus.status,
      activeJobId: workerStatus.activeJobId,
      totalCyclesCompleted: workerStatus.totalCyclesCompleted,
      totalCyclesFailed: workerStatus.totalCyclesFailed,
      lastRun: workerStatus.lastReport
        ? {
            id: workerStatus.lastReport.id,
            status: workerStatus.lastReport.status,
            completedAt: workerStatus.lastReport.completedAt,
            articlesInserted: workerStatus.lastReport.totalArticlesInserted,
            durationMs: workerStatus.lastReport.durationMs,
          }
        : null,
    },
    aiDetails: aiStatus,
    system: systemStatus,
  };

  return NextResponse.json(payload, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
