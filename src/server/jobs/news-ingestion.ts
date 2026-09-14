/**
 * Automated News Ingestion Job Orchestration
 *
 * Coordinates RSS and GDELT ingestion, URL canonicalization, deduplication,
 * and story clustering under a distributed mutex lock with telemetry.
 *
 * Guarantees:
 * - Idempotency: Duplicate runs within the same time window do not create duplicate stories or clusters.
 * - Concurrency Safety: Mutex lock prevents simultaneous overlapping ingestion cycles.
 * - Fault Isolation: Failure in one provider does not prevent other providers from processing.
 */

import { runIngestionCycle } from "../news/worker/coordinator";
import { acquireJobLock, releaseJobLock, type JobLockOptions } from "./job-lock";
import { recordJobStart, recordJobSuccess, recordJobFailure, recordJobSkipped } from "./telemetry";
import { logger } from "@/lib/logging/logger";

export interface NewsIngestionJobOptions extends JobLockOptions {
  providers?: Array<"rss" | "gdelt">;
  limitPerProvider?: number;
}

export interface NewsIngestionJobResult {
  startedAt: string;
  completedAt: string;
  sourcesProcessed: number;
  storiesFetched: number;
  storiesInserted: number;
  storiesDeduplicated: number;
  clustersCreated: number;
  failures: number;
  status: "completed" | "partial" | "failed" | "already_running";
  error?: string;
  durationMs: number;
}

/**
 * Runs the production news ingestion job.
 */
export async function runNewsIngestionJob(
  options: NewsIngestionJobOptions = {}
): Promise<NewsIngestionJobResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const jobName = "news-ingestion";

  // 1. Acquire Job Lock
  const lock = await acquireJobLock(jobName, options);

  if (!lock.success) {
    await recordJobSkipped(jobName, "Another news ingestion cycle is already active");
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      sourcesProcessed: 0,
      storiesFetched: 0,
      storiesInserted: 0,
      storiesDeduplicated: 0,
      clustersCreated: 0,
      failures: 0,
      status: "already_running",
      error: "Ingestion job is already running",
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Record Job Start
  const runId = await recordJobStart(jobName, {
    providers: options.providers || ["rss", "gdelt"],
    limitPerProvider: options.limitPerProvider ?? 30,
  });

  try {
    // 3. Execute Existing Pipeline
    const cycleReport = await runIngestionCycle({
      providers: options.providers,
      limitPerProvider: options.limitPerProvider,
      force: true, // Lock already held by this orchestrator
    });

    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    const sourcesProcessed = Object.keys(cycleReport.providerStats).length;
    const storiesFetched = cycleReport.totalArticlesFetched;
    const storiesInserted = cycleReport.totalArticlesInserted;
    const storiesDeduplicated = cycleReport.totalArticlesSkipped;
    // Each inserted article either creates a new cluster or attaches to an existing one
    const clustersCreated = cycleReport.totalArticlesInserted;
    const failures = cycleReport.totalArticlesFailed + cycleReport.errors.length;

    // 4. Record Success / Partial Telemetry
    await recordJobSuccess(runId, {
      durationMs,
      recordsProcessed: storiesFetched,
      recordsCreated: storiesInserted,
      errorCount: failures,
      metadata: {
        providerStats: cycleReport.providerStats,
        deduplicatedCount: storiesDeduplicated,
        errors: cycleReport.errors,
      },
    });

    return {
      startedAt,
      completedAt,
      sourcesProcessed,
      storiesFetched,
      storiesInserted,
      storiesDeduplicated,
      clustersCreated,
      failures,
      status: cycleReport.status === "failed" ? "failed" : cycleReport.status === "partial" ? "partial" : "completed",
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await recordJobFailure(runId, err, durationMs, {
      error: errorMessage,
    });

    logger.error("ingestion_failed", `News ingestion job failed: ${errorMessage}`, {
      jobName,
      jobId: runId,
      durationMs,
      errorMessage,
    });

    return {
      startedAt,
      completedAt: new Date().toISOString(),
      sourcesProcessed: 0,
      storiesFetched: 0,
      storiesInserted: 0,
      storiesDeduplicated: 0,
      clustersCreated: 0,
      failures: 1,
      status: "failed",
      error: errorMessage,
      durationMs,
    };
  } finally {
    // 5. Always Release Lock
    await releaseJobLock(jobName, lock.lockId, options.client);
  }
}
