/**
 * In-Process Ingestion Scheduler
 *
 * Runs background ingestion cycles on a configurable recurring interval
 * for long-running Node.js processes, background daemon workers, or local dev.
 */

import { runIngestionCycle } from "./coordinator";
import type { IngestionWorkerOptions } from "./types";

let schedulerTimer: NodeJS.Timeout | null = null;
let isSchedulerActive = false;

/**
 * Starts the in-process ingestion scheduler.
 *
 * @param intervalMinutes Interval between runs (default: 15 minutes)
 * @param options Worker options passed to each ingestion cycle
 */
export function startIngestionScheduler(
  intervalMinutes: number = 15,
  options?: IngestionWorkerOptions
): void {
  if (isSchedulerActive) {
    console.log("[Scheduler] Ingestion scheduler is already running.");
    return;
  }

  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  isSchedulerActive = true;

  console.log(`[Scheduler] Starting background ingestion scheduler (interval: ${intervalMinutes}m)...`);

  // Run initial cycle immediately
  runIngestionCycle(options).catch((err) => {
    console.error("[Scheduler] Initial ingestion cycle encountered an error:", err);
  });

  schedulerTimer = setInterval(() => {
    console.log("[Scheduler] Triggering scheduled ingestion cycle...");
    runIngestionCycle(options).catch((err) => {
      console.error("[Scheduler] Scheduled ingestion cycle encountered an error:", err);
    });
  }, intervalMs);

  // Allow Node process to exit naturally if only this timer is left
  if (schedulerTimer.unref) {
    schedulerTimer.unref();
  }
}

/**
 * Stops the in-process ingestion scheduler.
 */
export function stopIngestionScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  isSchedulerActive = false;
  console.log("[Scheduler] Ingestion scheduler stopped.");
}

/**
 * Returns whether the scheduler is currently active.
 */
export function isSchedulerRunning(): boolean {
  return isSchedulerActive;
}
