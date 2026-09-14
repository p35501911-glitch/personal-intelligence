/**
 * Automated AI Intelligence Processing Job
 *
 * Scans for newly clustered stories without completed intelligence dossiers,
 * classifying them via Gemini Flash-Lite and triggering Flash deep-analysis
 * only for stories meeting or exceeding the composite importance threshold.
 *
 * Guarantees:
 * - Free-tier quota protection: Respects AI_ENABLED, AI_BATCH_SIZE, AI_CONCURRENCY.
 * - Circuit breaker: 429 quota exhaustion stops batch processing immediately and saves fallbacks.
 * - Concurrency safety: Distributed lock prevents duplicate AI processing runs.
 * - Zero extra Gemini calls for telemetry or monitoring.
 */

import { processPendingStoryIntelligence } from "../ai/pipeline";
import { isAiEnabled, isGeminiConfigured } from "../ai/client";
import { acquireJobLock, releaseJobLock, type JobLockOptions } from "./job-lock";
import { recordJobStart, recordJobSuccess, recordJobFailure, recordJobSkipped } from "./telemetry";
import { logger } from "@/lib/logging/logger";

export interface AiProcessingJobOptions extends JobLockOptions {
  limit?: number;
  forceRegenerate?: boolean;
}

export interface AiProcessingJobResult {
  processed: number;
  succeeded: number;
  failed: number;
  normal: number;
  important: number;
  flashLiteCalls: number;
  flashCalls: number;
  quotaEvents: number;
  durationMs: number;
  status: "completed" | "disabled" | "quota_exhausted" | "already_running" | "failed";
  error?: string;
}

/**
 * Runs the automated AI processing job.
 */
export async function runAiProcessingJob(
  options: AiProcessingJobOptions = {}
): Promise<AiProcessingJobResult> {
  const startTime = Date.now();
  const jobName = "ai-processing";

  // 1. Check AI enablement
  if (!isAiEnabled()) {
    logger.info("job_completed", "AI processing is disabled via AI_ENABLED=false", { jobName });
    await recordJobSkipped(jobName, "AI processing disabled via configuration");
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      normal: 0,
      important: 0,
      flashLiteCalls: 0,
      flashCalls: 0,
      quotaEvents: 0,
      durationMs: Date.now() - startTime,
      status: "disabled",
    };
  }

  // 2. Check Gemini configuration
  if (!isGeminiConfigured()) {
    logger.warn("job_failed", "GEMINI_API_KEY is not configured in server environment", { jobName });
    await recordJobSkipped(jobName, "GEMINI_API_KEY missing");
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      normal: 0,
      important: 0,
      flashLiteCalls: 0,
      flashCalls: 0,
      quotaEvents: 0,
      durationMs: Date.now() - startTime,
      status: "disabled",
      error: "GEMINI_API_KEY not configured",
    };
  }

  // 3. Acquire Job Lock
  const lock = await acquireJobLock(jobName, options);
  if (!lock.success) {
    await recordJobSkipped(jobName, "Another AI processing job is currently running");
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      normal: 0,
      important: 0,
      flashLiteCalls: 0,
      flashCalls: 0,
      quotaEvents: 0,
      durationMs: Date.now() - startTime,
      status: "already_running",
      error: "AI processing job is already running",
    };
  }

  const runId = await recordJobStart(jobName, {
    limit: options.limit ?? 10,
    forceRegenerate: options.forceRegenerate ?? false,
  });

  try {
    // 4. Run existing AI pipeline
    const stats = await processPendingStoryIntelligence({
      limit: options.limit,
      forceRegenerate: options.forceRegenerate,
    });

    const durationMs = Date.now() - startTime;
    // Each processed story invokes Flash-Lite, and important stories also invoke Flash if deep analysis is enabled
    const flashLiteCalls = stats.processed;
    const flashCalls = stats.important;
    const quotaEvents = stats.rateLimited ? 1 : 0;

    let status: AiProcessingJobResult["status"] = "completed";
    if (stats.rateLimited) {
      status = "quota_exhausted";
      logger.warn("ai_quota_exhausted", "AI processing encountered 429 quota exhaustion. Fallback preserved.", {
        jobName,
        jobId: runId,
        counts: { processed: stats.processed, failed: stats.failed },
      });
    }

    await recordJobSuccess(runId, {
      durationMs,
      recordsProcessed: stats.processed,
      recordsCreated: stats.succeeded,
      errorCount: stats.failed,
      metadata: {
        normal: stats.normal,
        important: stats.important,
        flashLiteCalls,
        flashCalls,
        quotaEvents,
        rateLimited: stats.rateLimited,
      },
    });

    return {
      processed: stats.processed,
      succeeded: stats.succeeded,
      failed: stats.failed,
      normal: stats.normal,
      important: stats.important,
      flashLiteCalls,
      flashCalls,
      quotaEvents,
      durationMs,
      status,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await recordJobFailure(runId, err, durationMs, {
      error: errorMessage,
    });

    logger.error("ai_processing_failed", `AI processing job failed: ${errorMessage}`, {
      jobName,
      jobId: runId,
      durationMs,
      errorMessage,
    });

    return {
      processed: 0,
      succeeded: 0,
      failed: 1,
      normal: 0,
      important: 0,
      flashLiteCalls: 0,
      flashCalls: 0,
      quotaEvents: 0,
      durationMs,
      status: "failed",
      error: errorMessage,
    };
  } finally {
    // 5. Always release lock
    await releaseJobLock(jobName, lock.lockId, options.client);
  }
}
