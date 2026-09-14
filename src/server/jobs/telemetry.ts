/**
 * System Job Run Telemetry Service
 *
 * Records execution history, duration, processed record counts, and failure rates
 * into the `system_job_runs` table for operational observability.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseClient } from "../supabase";
import { logger } from "@/lib/logging/logger";

export type JobStatus = "running" | "completed" | "failed" | "skipped";

export interface JobRunRecord {
  id: string;
  job_name: string;
  status: JobStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  records_processed: number;
  records_created: number;
  error_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// In-memory telemetry cache for testing and resilient fallback
const inMemoryRuns = new Map<string, JobRunRecord>();

/**
 * Records the start of a background job.
 */
export async function recordJobStart(
  jobName: string,
  metadata: Record<string, unknown> = {},
  client: SupabaseClient = getServiceSupabaseClient()
): Promise<string> {
  const id = randomUUID();
  const startedAt = new Date().toISOString();

  const record: JobRunRecord = {
    id,
    job_name: jobName,
    status: "running",
    started_at: startedAt,
    completed_at: null,
    duration_ms: null,
    records_processed: 0,
    records_created: 0,
    error_count: 0,
    metadata,
    created_at: startedAt,
  };

  inMemoryRuns.set(id, record);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any).from("system_job_runs").insert({
      id,
      job_name: jobName,
      status: "running",
      started_at: startedAt,
      metadata,
    });

    if (error) {
      logger.debug("job_started", `Could not record job start to DB: ${error.message}`, { jobName, jobId: id });
    }
  } catch (err: unknown) {
    logger.debug("job_started", `DB insert skipped for job start: ${err instanceof Error ? err.message : String(err)}`, {
      jobName,
      jobId: id,
    });
  }

  logger.info("job_started", `Started job "${jobName}"`, {
    jobName,
    jobId: id,
    extra: metadata,
  });

  return id;
}

/**
 * Records successful completion of a background job.
 */
export async function recordJobSuccess(
  runId: string,
  stats: {
    durationMs: number;
    recordsProcessed?: number;
    recordsCreated?: number;
    errorCount?: number;
    metadata?: Record<string, unknown>;
  },
  client: SupabaseClient = getServiceSupabaseClient()
): Promise<void> {
  const completedAt = new Date().toISOString();
  const existing = inMemoryRuns.get(runId);
  const jobName = existing?.job_name || "unknown-job";

  if (existing) {
    existing.status = "completed";
    existing.completed_at = completedAt;
    existing.duration_ms = stats.durationMs;
    existing.records_processed = stats.recordsProcessed ?? 0;
    existing.records_created = stats.recordsCreated ?? 0;
    existing.error_count = stats.errorCount ?? 0;
    existing.metadata = { ...existing.metadata, ...stats.metadata };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any)
      .from("system_job_runs")
      .update({
        status: "completed",
        completed_at: completedAt,
        duration_ms: stats.durationMs,
        records_processed: stats.recordsProcessed ?? 0,
        records_created: stats.recordsCreated ?? 0,
        error_count: stats.errorCount ?? 0,
        metadata: existing?.metadata || stats.metadata || {},
      })
      .eq("id", runId);

    if (error) {
      logger.debug("job_completed", `Could not update job success in DB: ${error.message}`, { jobId: runId });
    }
  } catch (err: unknown) {
    logger.debug("job_completed", `DB update skipped for job success: ${err instanceof Error ? err.message : String(err)}`, {
      jobId: runId,
    });
  }

  logger.info("job_completed", `Completed job "${jobName}" in ${stats.durationMs}ms`, {
    jobName,
    jobId: runId,
    durationMs: stats.durationMs,
    recordsProcessed: stats.recordsProcessed,
    recordsCreated: stats.recordsCreated,
    counts: {
      processed: stats.recordsProcessed ?? 0,
      created: stats.recordsCreated ?? 0,
      errors: stats.errorCount ?? 0,
    },
  });
}

/**
 * Records failure of a background job.
 */
export async function recordJobFailure(
  runId: string,
  error: unknown,
  durationMs: number,
  metadata: Record<string, unknown> = {},
  client: SupabaseClient = getServiceSupabaseClient()
): Promise<void> {
  const completedAt = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const existing = inMemoryRuns.get(runId);
  const jobName = existing?.job_name || "unknown-job";

  if (existing) {
    existing.status = "failed";
    existing.completed_at = completedAt;
    existing.duration_ms = durationMs;
    existing.error_count = (existing.error_count || 0) + 1;
    existing.metadata = { ...existing.metadata, ...metadata, error: errorMessage };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (client as any)
      .from("system_job_runs")
      .update({
        status: "failed",
        completed_at: completedAt,
        duration_ms: durationMs,
        error_count: 1,
        metadata: existing?.metadata || { ...metadata, error: errorMessage },
      })
      .eq("id", runId);

    if (updateError) {
      logger.debug("job_failed", `Could not update job failure in DB: ${updateError.message}`, { jobId: runId });
    }
  } catch (err: unknown) {
    logger.debug("job_failed", `DB update skipped for job failure: ${err instanceof Error ? err.message : String(err)}`, {
      jobId: runId,
    });
  }

  logger.error("job_failed", `Job "${jobName}" failed after ${durationMs}ms: ${errorMessage}`, {
    jobName,
    jobId: runId,
    durationMs,
    errorMessage,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}

/**
 * Records a skipped background job (e.g. when already running or cached).
 */
export async function recordJobSkipped(
  jobName: string,
  reason: string,
  client: SupabaseClient = getServiceSupabaseClient()
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const record: JobRunRecord = {
    id,
    job_name: jobName,
    status: "skipped",
    started_at: now,
    completed_at: now,
    duration_ms: 0,
    records_processed: 0,
    records_created: 0,
    error_count: 0,
    metadata: { reason },
    created_at: now,
  };

  inMemoryRuns.set(id, record);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).from("system_job_runs").insert({
      id,
      job_name: jobName,
      status: "skipped",
      started_at: now,
      completed_at: now,
      duration_ms: 0,
      metadata: { reason },
    });
  } catch {
    // Non-blocking
  }

  logger.info("job_completed", `Skipped job "${jobName}": ${reason}`, {
    jobName,
    jobId: id,
    extra: { reason },
  });

  return id;
}

/**
 * Returns recent job run telemetry from in-memory cache and/or database.
 */
export async function getRecentJobRuns(
  jobName?: string,
  limit = 20,
  client: SupabaseClient = getServiceSupabaseClient()
): Promise<JobRunRecord[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (client as any)
      .from("system_job_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (jobName) {
      query = query.eq("job_name", jobName);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data as JobRunRecord[];
    }
  } catch {
    // Fall back to in-memory records
  }

  const memoryList = Array.from(inMemoryRuns.values()).reverse();
  if (jobName) {
    return memoryList.filter((r) => r.job_name === jobName).slice(0, limit);
  }
  return memoryList.slice(0, limit);
}

/**
 * Clears in-memory job runs. Useful in unit tests.
 */
export function clearInMemoryJobRuns(): void {
  inMemoryRuns.clear();
}
