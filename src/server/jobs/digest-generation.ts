/**
 * Automated Digest Generation Job
 *
 * Orchestrates periodic executive briefings (Daily and Weekly) for active users.
 *
 * Guarantees:
 * - Idempotency: Running the job multiple times within the same period window skips already-generated digests.
 * - Quota Protection: Exactly one Gemini call per newly generated digest, with deterministic fallback when AI is unavailable.
 * - Concurrency Safety: Distributed lock prevents concurrent duplicate batch generation.
 */

import { runScheduledDigestGeneration, type ScheduledDigestReport } from "../news/digests/scheduler";
import type { DigestPeriodType } from "../news/digests/types";
import { acquireJobLock, releaseJobLock, type JobLockOptions } from "./job-lock";
import { recordJobStart, recordJobSuccess, recordJobFailure, recordJobSkipped } from "./telemetry";
import { logger } from "@/lib/logging/logger";

export interface DigestJobOptions extends JobLockOptions {
  periodType: DigestPeriodType;
  userLimit?: number;
  force?: boolean;
}

export interface DigestJobResult {
  periodType: DigestPeriodType;
  totalUsersChecked: number;
  digestsGenerated: number;
  digestsSkipped: number;
  failures: number;
  durationMs: number;
  status: "completed" | "cached" | "already_running" | "failed";
  error?: string;
}

/**
 * Runs scheduled digest generation for the specified period type.
 */
export async function runDigestGenerationJob(
  options: DigestJobOptions
): Promise<DigestJobResult> {
  const startTime = Date.now();
  const periodType = options.periodType;
  const jobName = `digest-generation-${periodType}`;

  // 1. Acquire Job Lock
  const lock = await acquireJobLock(jobName, options);
  if (!lock.success) {
    await recordJobSkipped(jobName, `Another ${periodType} digest generation job is already running`);
    return {
      periodType,
      totalUsersChecked: 0,
      digestsGenerated: 0,
      digestsSkipped: 0,
      failures: 0,
      durationMs: Date.now() - startTime,
      status: "already_running",
      error: `Digest generation job (${periodType}) is already running`,
    };
  }

  const runId = await recordJobStart(jobName, {
    periodType,
    userLimit: options.userLimit ?? 25,
    force: options.force ?? false,
  });

  try {
    // 2. Run Scheduled Generation
    const report: ScheduledDigestReport = await runScheduledDigestGeneration({
      periodType,
      userLimit: options.userLimit,
      force: options.force,
      client: options.client,
    });

    const durationMs = Date.now() - startTime;
    const isCached = report.digestsGenerated === 0 && report.digestsSkipped > 0;
    const status: DigestJobResult["status"] =
      report.failures > 0 ? "failed" : isCached ? "cached" : "completed";

    await recordJobSuccess(runId, {
      durationMs,
      recordsProcessed: report.totalUsersChecked,
      recordsCreated: report.digestsGenerated,
      errorCount: report.failures,
      metadata: {
        periodType,
        digestsSkipped: report.digestsSkipped,
        isCached,
        errors: report.errors,
      },
    });

    return {
      periodType,
      totalUsersChecked: report.totalUsersChecked,
      digestsGenerated: report.digestsGenerated,
      digestsSkipped: report.digestsSkipped,
      failures: report.failures,
      durationMs,
      status,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await recordJobFailure(runId, err, durationMs, {
      periodType,
      error: errorMessage,
    });

    logger.error("digest_generation_failed", `Digest generation (${periodType}) failed: ${errorMessage}`, {
      jobName,
      jobId: runId,
      durationMs,
      errorMessage,
    });

    return {
      periodType,
      totalUsersChecked: 0,
      digestsGenerated: 0,
      digestsSkipped: 0,
      failures: 1,
      durationMs,
      status: "failed",
      error: errorMessage,
    };
  } finally {
    // 3. Always release lock
    await releaseJobLock(jobName, lock.lockId, options.client);
  }
}

/**
 * Convenience helper for daily digest generation.
 */
export async function generateDailyDigest(options: Omit<DigestJobOptions, "periodType"> = {}): Promise<DigestJobResult> {
  return runDigestGenerationJob({ ...options, periodType: "daily" });
}

/**
 * Convenience helper for weekly digest generation.
 */
export async function generateWeeklyDigest(options: Omit<DigestJobOptions, "periodType"> = {}): Promise<DigestJobResult> {
  return runDigestGenerationJob({ ...options, periodType: "weekly" });
}
