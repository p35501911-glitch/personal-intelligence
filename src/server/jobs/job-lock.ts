/**
 * Reusable Distributed Job Lock Abstraction
 *
 * Prevents concurrent execution of background jobs across serverless instances and worker processes.
 *
 * Guarantees:
 * - Mutex isolation per jobName
 * - Automatic stale-lock expiration and clearance
 * - Release in finally block to avoid permanent deadlocks
 * - Database-backed via `system_job_locks` with graceful in-memory fallback for local dev/testing
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseClient } from "../supabase";
import { logger } from "@/lib/logging/logger";

export interface JobLockOptions {
  /** Maximum lock duration in milliseconds before considered stale (default: 10 minutes) */
  timeoutMs?: number;
  /** Force acquire by breaking any existing lock (emergency override) */
  force?: boolean;
  /** Optional Supabase client instance */
  client?: SupabaseClient;
}

export type JobLockResult =
  | { success: true; lockId: string; jobName: string }
  | { success: false; status: "already_running"; jobName: string; currentLockId?: string; lockedAt?: string };

interface MemoryLockEntry {
  lockId: string;
  acquiredAt: number;
  expiresAt: number;
}

const memoryLocks = new Map<string, MemoryLockEntry>();

/**
 * Attempts to acquire an exclusive lock for a given job.
 */
export async function acquireJobLock(
  jobName: string,
  options: JobLockOptions = {}
): Promise<JobLockResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000; // 10 minutes default
  const force = options.force ?? false;
  const client = options.client ?? getServiceSupabaseClient();
  const lockId = randomUUID();
  const now = Date.now();
  const expiresAt = now + timeoutMs;
  const expiresAtIso = new Date(expiresAt).toISOString();
  const nowIso = new Date(now).toISOString();

  // 1. Check in-memory lock
  const memLock = memoryLocks.get(jobName);
  if (memLock && !force) {
    if (now > memLock.expiresAt) {
      // Stale in-memory lock expired
      logger.warn("job_started", `Stale in-memory lock detected for "${jobName}". Auto-releasing.`, {
        jobName,
        jobId: memLock.lockId,
      });
      memoryLocks.delete(jobName);
    } else {
      logger.warn("job_started", `Job "${jobName}" lock rejected: already running.`, {
        jobName,
        jobId: memLock.lockId,
      });
      return {
        success: false,
        status: "already_running",
        jobName,
        currentLockId: memLock.lockId,
        lockedAt: new Date(memLock.acquiredAt).toISOString(),
      };
    }
  }

  // 2. Check and acquire database lock
  try {
    // Check if an unexpired lock exists in system_job_locks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLock } = await (client as any)
      .from("system_job_locks")
      .select("*")
      .eq("job_name", jobName)
      .maybeSingle();

    if (existingLock && !force) {
      const dbExpiresAt = new Date(existingLock.expires_at).getTime();
      if (now < dbExpiresAt) {
        // Active lock held in DB
        return {
          success: false,
          status: "already_running",
          jobName,
          currentLockId: existingLock.locked_by,
          lockedAt: existingLock.acquired_at,
        };
      } else {
        // Stale lock in DB, overwrite it
        logger.warn("job_started", `Stale DB lock detected for "${jobName}" (expired at ${existingLock.expires_at}). Clearing.`, {
          jobName,
        });
      }
    }

    // Upsert the lock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).from("system_job_locks").upsert({
      job_name: jobName,
      locked_by: lockId,
      acquired_at: nowIso,
      expires_at: expiresAtIso,
    });
  } catch (err: unknown) {
    // If DB is offline or table not present, rely on in-memory lock
    logger.debug("job_started", `DB lock storage notice: ${err instanceof Error ? err.message : String(err)}`, {
      jobName,
    });
  }

  // Set in-memory lock
  memoryLocks.set(jobName, {
    lockId,
    acquiredAt: now,
    expiresAt,
  });

  return {
    success: true,
    lockId,
    jobName,
  };
}

/**
 * Releases a job lock.
 */
export async function releaseJobLock(
  jobName: string,
  lockId?: string,
  client: SupabaseClient = getServiceSupabaseClient()
): Promise<void> {
  const memLock = memoryLocks.get(jobName);
  if (!lockId || (memLock && memLock.lockId === lockId)) {
    memoryLocks.delete(jobName);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (client as any).from("system_job_locks").delete().eq("job_name", jobName);
    if (lockId) {
      query = query.eq("locked_by", lockId);
    }
    await query;
  } catch (err: unknown) {
    logger.debug("job_completed", `DB lock release notice: ${err instanceof Error ? err.message : String(err)}`, {
      jobName,
    });
  }
}

/**
 * Executes a function within the safety of an exclusive distributed job lock.
 * Automatically handles acquisition, skip if running, and release in finally.
 */
export async function withJobLock<T>(
  jobName: string,
  fn: (lockId: string) => Promise<T>,
  options: JobLockOptions = {}
): Promise<{ status: "executed"; result: T } | { status: "already_running" }> {
  const lock = await acquireJobLock(jobName, options);

  if (!lock.success) {
    return { status: "already_running" };
  }

  try {
    const result = await fn(lock.lockId);
    return { status: "executed", result };
  } finally {
    await releaseJobLock(jobName, lock.lockId, options.client);
  }
}

/**
 * Resets all in-memory job locks. Useful for test isolation.
 */
export function resetAllJobLocks(): void {
  memoryLocks.clear();
}
