import type { IngestionStats } from "../persistence";

export interface IngestionWorkerOptions {
  providers?: Array<"gdelt" | "rss">;
  limitPerProvider?: number;
  force?: boolean;
  timeoutMs?: number;
}

export type IngestionCycleStatus = "completed" | "partial" | "failed" | "already_running";

export interface IngestionCycleReport {
  id: string;
  status: IngestionCycleStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  providerStats: Record<string, IngestionStats>;
  totalArticlesFetched: number;
  totalArticlesInserted: number;
  totalArticlesSkipped: number;
  totalArticlesFailed: number;
  errors: string[];
}

export interface WorkerState {
  status: "idle" | "running" | "error";
  activeJobId?: string | null;
  activeJobStartedAt?: string | null;
  lastReport?: IngestionCycleReport | null;
  totalCyclesCompleted: number;
  totalCyclesFailed: number;
}
