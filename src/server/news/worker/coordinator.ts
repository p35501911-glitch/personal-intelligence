/**
 * Ingestion Worker Coordinator
 *
 * Coordinates multi-provider news ingestion (GDELT + RSS), ensures concurrency safety
 * via a robust execution lock, provides fault isolation across providers, and tracks
 * pipeline execution telemetry.
 */

import { randomUUID } from "node:crypto";
import { gdeltNewsProvider, rssNewsProvider } from "../providers";
import { persistArticles, type IngestionStats } from "../persistence";
import { getServiceSupabaseClient } from "../../supabase";
import type {
  IngestionWorkerOptions,
  IngestionCycleReport,
  WorkerState,
} from "./types";

// Mutex & Concurrency State
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes maximum before automatic stale lock clearance

let isLocked = false;
let activeJobId: string | null = null;
let activeJobStartedAt: Date | null = null;
let lastReport: IngestionCycleReport | null = null;
let totalCyclesCompleted = 0;
let totalCyclesFailed = 0;

/**
 * Returns current health and execution status of the ingestion worker.
 */
export function getWorkerStatus(): WorkerState {
  return {
    status: isLocked ? "running" : lastReport?.status === "failed" ? "error" : "idle",
    activeJobId,
    activeJobStartedAt: activeJobStartedAt?.toISOString() || null,
    lastReport,
    totalCyclesCompleted,
    totalCyclesFailed,
  };
}

/**
 * Manually clears any active worker lock. Useful in testing or recovery scenarios.
 */
export function resetWorkerLock(): void {
  isLocked = false;
  activeJobId = null;
  activeJobStartedAt = null;
  lastReport = null;
}

/**
 * Runs a complete news ingestion cycle across configured providers.
 *
 * Guarantees:
 * - Mutex concurrency safety: prevents overlapping runs
 * - Fault isolation: failure in one provider does not prevent others from running
 * - End-to-end processing: ingestion -> deduplication -> persistence -> categorization -> clustering -> importance
 */
export async function runIngestionCycle(
  options: IngestionWorkerOptions = {}
): Promise<IngestionCycleReport> {
  const cycleId = randomUUID();
  const startTime = Date.now();
  const startedAtIso = new Date(startTime).toISOString();

  // 1. Concurrency Check & Mutex Lock
  if (isLocked && !options.force) {
    // Check for stale lock
    if (activeJobStartedAt && Date.now() - activeJobStartedAt.getTime() > LOCK_TIMEOUT_MS) {
      console.warn(`[Worker] Detected stale ingestion lock (Job: ${activeJobId}). Auto-releasing lock.`);
      resetWorkerLock();
    } else {
      console.warn(`[Worker] Ingestion cycle rejected: another cycle is already active (Job: ${activeJobId}).`);
      return {
        id: cycleId,
        status: "already_running",
        startedAt: startedAtIso,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        providerStats: {},
        totalArticlesFetched: 0,
        totalArticlesInserted: 0,
        totalArticlesSkipped: 0,
        totalArticlesFailed: 0,
        errors: [`Ingestion cycle already in progress (Job ID: ${activeJobId})`],
      };
    }
  }

  // Acquire Lock
  isLocked = true;
  activeJobId = cycleId;
  activeJobStartedAt = new Date();

  console.log(`[Worker] Starting Ingestion Cycle ${cycleId}...`);

  const client = getServiceSupabaseClient();
  const limitPerProvider = options.limitPerProvider ?? 30;
  const requestedProviders = options.providers || ["rss", "gdelt"];
  const providerStats: Record<string, IngestionStats> = {};
  const errors: string[] = [];

  try {
    // 2. Prepare Provider Tasks
    const tasks: Array<{
      name: string;
      execute: () => Promise<IngestionStats>;
    }> = [];

    if (requestedProviders.includes("rss")) {
      tasks.push({
        name: "rss",
        execute: async () => {
          const articles = await rssNewsProvider.fetchLatest({ limit: limitPerProvider });
          if (articles.length === 0) {
            return {
              provider: "rss",
              fetched: 0,
              inserted: 0,
              updated: 0,
              skipped: 0,
              failed: 0,
              durationMs: 0,
            };
          }
          return await persistArticles(articles, {
            provider: "rss",
            client,
            ignoreDuplicates: true,
          });
        },
      });
    }

    if (requestedProviders.includes("gdelt")) {
      tasks.push({
        name: "gdelt",
        execute: async () => {
          const articles = await gdeltNewsProvider.fetchLatest({ limit: limitPerProvider });
          if (articles.length === 0) {
            return {
              provider: "gdelt",
              fetched: 0,
              inserted: 0,
              updated: 0,
              skipped: 0,
              failed: 0,
              durationMs: 0,
            };
          }
          return await persistArticles(articles, {
            provider: "gdelt",
            client,
            ignoreDuplicates: true,
          });
        },
      });
    }

    // 3. Execute with Fault Isolation (Promise.allSettled)
    const results = await Promise.allSettled(
      tasks.map(async (t) => {
        const tStart = Date.now();
        const stats = await t.execute();
        stats.durationMs = Date.now() - tStart;
        return { name: t.name, stats };
      })
    );

    // 4. Collect Results & Errors
    let hasSuccess = false;
    let hasFailure = false;

    for (let i = 0; i < results.length; i++) {
      const taskName = tasks[i].name;
      const res = results[i];

      if (res.status === "fulfilled") {
        hasSuccess = true;
        providerStats[taskName] = res.value.stats;
        console.log(
          `[Worker] Provider "${taskName}" completed: ` +
            `fetched=${res.value.stats.fetched}, inserted=${res.value.stats.inserted}, ` +
            `skipped=${res.value.stats.skipped}, failed=${res.value.stats.failed} ` +
            `(${res.value.stats.durationMs}ms)`
        );
      } else {
        hasFailure = true;
        const errMessage = res.reason instanceof Error ? res.reason.message : String(res.reason);
        errors.push(`Provider "${taskName}" error: ${errMessage}`);
        console.error(`[Worker] Provider "${taskName}" failed:`, res.reason);

        providerStats[taskName] = {
          provider: taskName,
          fetched: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          failed: 1,
          durationMs: 0,
        };
      }
    }

    // 5. Aggregate Totals
    let totalFetched = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const s of Object.values(providerStats)) {
      totalFetched += s.fetched;
      totalInserted += s.inserted;
      totalSkipped += s.skipped;
      totalFailed += s.failed;
    }

    const durationMs = Date.now() - startTime;
    let status: "completed" | "partial" | "failed";

    if (tasks.length === 0 || (hasSuccess && !hasFailure)) {
      status = "completed";
      totalCyclesCompleted++;
    } else if (hasSuccess && hasFailure) {
      status = "partial";
      totalCyclesCompleted++;
    } else {
      status = "failed";
      totalCyclesFailed++;
    }

    const report: IngestionCycleReport = {
      id: cycleId,
      status,
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
      durationMs,
      providerStats,
      totalArticlesFetched: totalFetched,
      totalArticlesInserted: totalInserted,
      totalArticlesSkipped: totalSkipped,
      totalArticlesFailed: totalFailed,
      errors,
    };

    lastReport = report;
    console.log(`[Worker] Ingestion Cycle ${cycleId} finished with status "${status}" in ${durationMs}ms.`);
    return report;
  } catch (unexpectedError) {
    totalCyclesFailed++;
    const errMessage = unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError);
    errors.push(`Unexpected worker failure: ${errMessage}`);

    const report: IngestionCycleReport = {
      id: cycleId,
      status: "failed",
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      providerStats,
      totalArticlesFetched: 0,
      totalArticlesInserted: 0,
      totalArticlesSkipped: 0,
      totalArticlesFailed: 0,
      errors,
    };

    lastReport = report;
    return report;
  } finally {
    // Release Mutex Lock
    isLocked = false;
    activeJobId = null;
    activeJobStartedAt = null;
  }
}
