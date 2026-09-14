/**
 * Master Production Cycle Orchestrator
 *
 * Coordinates end-to-end background operations in strict sequential order with fault isolation:
 *
 * Stage 1: News Ingestion (RSS + GDELT + Deduplication + Clustering)
 *     ↓
 * Stage 2: AI Intelligence Processing (Flash-Lite / Flash Quota-Protected)
 *     ↓
 * Stage 3: Digest Generation (Daily / Weekly Briefings)
 *
 * Fault Isolation Guarantee:
 * A failure in one stage never crashes subsequent stages or corrupts database state.
 */

import { runNewsIngestionJob, type NewsIngestionJobResult, type NewsIngestionJobOptions } from "./news-ingestion";
import { runAiProcessingJob, type AiProcessingJobResult, type AiProcessingJobOptions } from "./ai-processing";
import { generateDailyDigest, generateWeeklyDigest, type DigestJobResult } from "./digest-generation";
import { recordJobStart, recordJobSuccess, recordJobFailure } from "./telemetry";
import { logger } from "@/lib/logging/logger";

export interface ProductionCycleOptions {
  ingestionOptions?: NewsIngestionJobOptions;
  aiOptions?: AiProcessingJobOptions;
  includeDailyDigest?: boolean;
  includeWeeklyDigest?: boolean;
}

export interface ProductionCycleReport {
  success: boolean;
  ingestion: NewsIngestionJobResult;
  ai: AiProcessingJobResult;
  digest: {
    daily?: DigestJobResult;
    weekly?: DigestJobResult;
  };
  durationMs: number;
  errors: string[];
}

/**
 * Runs the master production cycle.
 */
export async function runProductionCycle(
  options: ProductionCycleOptions = {}
): Promise<ProductionCycleReport> {
  const startTime = Date.now();
  const jobName = "master-production-cycle";
  const errors: string[] = [];

  const runId = await recordJobStart(jobName, {
    includeDailyDigest: options.includeDailyDigest ?? true,
    includeWeeklyDigest: options.includeWeeklyDigest ?? false,
  });

  logger.info("job_started", "Starting master production cycle", { jobName, jobId: runId });

  // -------------------------------------------------------------
  // Stage 1: News Ingestion
  // -------------------------------------------------------------
  let ingestionResult: NewsIngestionJobResult;
  try {
    ingestionResult = await runNewsIngestionJob(options.ingestionOptions);
    if (ingestionResult.status === "failed") {
      errors.push(`Ingestion failure: ${ingestionResult.error || "unknown"}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Ingestion error: ${msg}`);
    ingestionResult = {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sourcesProcessed: 0,
      storiesFetched: 0,
      storiesInserted: 0,
      storiesDeduplicated: 0,
      clustersCreated: 0,
      failures: 1,
      status: "failed",
      error: msg,
      durationMs: 0,
    };
  }

  // -------------------------------------------------------------
  // Stage 2: AI Intelligence Processing
  // -------------------------------------------------------------
  let aiResult: AiProcessingJobResult;
  try {
    aiResult = await runAiProcessingJob(options.aiOptions);
    if (aiResult.status === "failed") {
      errors.push(`AI processing failure: ${aiResult.error || "unknown"}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`AI processing error: ${msg}`);
    aiResult = {
      processed: 0,
      succeeded: 0,
      failed: 1,
      normal: 0,
      important: 0,
      flashLiteCalls: 0,
      flashCalls: 0,
      quotaEvents: 0,
      durationMs: 0,
      status: "failed",
      error: msg,
    };
  }

  // -------------------------------------------------------------
  // Stage 3: Digest Generation
  // -------------------------------------------------------------
  const digestReports: { daily?: DigestJobResult; weekly?: DigestJobResult } = {};

  if (options.includeDailyDigest ?? true) {
    try {
      digestReports.daily = await generateDailyDigest();
      if (digestReports.daily.status === "failed") {
        errors.push(`Daily digest failure: ${digestReports.daily.error || "unknown"}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Daily digest error: ${msg}`);
    }
  }

  if (options.includeWeeklyDigest ?? false) {
    try {
      digestReports.weekly = await generateWeeklyDigest();
      if (digestReports.weekly.status === "failed") {
        errors.push(`Weekly digest failure: ${digestReports.weekly.error || "unknown"}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Weekly digest error: ${msg}`);
    }
  }

  const durationMs = Date.now() - startTime;
  const isOverallSuccess = errors.length === 0;

  if (isOverallSuccess) {
    await recordJobSuccess(runId, {
      durationMs,
      recordsProcessed: ingestionResult.storiesFetched + aiResult.processed,
      recordsCreated: ingestionResult.storiesInserted + (digestReports.daily?.digestsGenerated ?? 0),
      errorCount: errors.length,
      metadata: {
        ingestionStatus: ingestionResult.status,
        aiStatus: aiResult.status,
      },
    });
  } else {
    await recordJobFailure(runId, new Error(errors.join("; ")), durationMs, {
      errors,
    });
  }

  logger.info("job_completed", `Master production cycle finished in ${durationMs}ms (success: ${isOverallSuccess})`, {
    jobName,
    jobId: runId,
    durationMs,
    counts: {
      fetched: ingestionResult.storiesFetched,
      inserted: ingestionResult.storiesInserted,
      aiProcessed: aiResult.processed,
      errors: errors.length,
    },
  });

  return {
    success: isOverallSuccess,
    ingestion: ingestionResult,
    ai: aiResult,
    digest: digestReports,
    durationMs,
    errors,
  };
}
