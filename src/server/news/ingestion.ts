import type { NewsFetchOptions, NewsProvider, NormalizedArticle } from "./types";
import {
  persistArticles,
  type IngestionStats,
  type PersistArticlesOptions,
} from "./persistence";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type IngestionOptions = NewsFetchOptions & {
  persist?: boolean;
  client?: SupabaseClient<Database>;
  batchSize?: number;
  ignoreDuplicates?: boolean;
};

export interface IngestionResult {
  provider: string;
  articles: NormalizedArticle[];
  stats: IngestionStats;
  timings: {
    fetchDurationMs: number;
    persistDurationMs: number;
    totalDurationMs: number;
  };
}

/**
 * Low-level provider fetch wrapper with error boundary.
 */
export async function fetchFromProvider(
  provider: NewsProvider,
  options?: NewsFetchOptions
): Promise<NormalizedArticle[]> {
  try {
    return await provider.fetchLatest(options);
  } catch (error) {
    console.error(`News provider "${provider.name}" failed:`, error);
    return [];
  }
}

/**
 * End-to-end ingestion pipeline:
 * NewsProvider.fetchLatest() -> NormalizedArticle[] -> persistArticles() -> PostgreSQL
 */
export async function ingestFromProvider(
  provider: NewsProvider,
  options?: IngestionOptions
): Promise<IngestionResult> {
  const overallStart = Date.now();

  // 1. Fetch from provider
  const fetchStart = Date.now();
  const articles = await fetchFromProvider(provider, options);
  const fetchDurationMs = Date.now() - fetchStart;

  // 2. Persist to database (if enabled, default: true)
  const shouldPersist = options?.persist !== false;
  let persistDurationMs = 0;
  let stats: IngestionStats = {
    provider: provider.name,
    fetched: articles.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  if (shouldPersist && articles.length > 0) {
    const persistStart = Date.now();
    const persistOptions: PersistArticlesOptions = {
      provider: provider.name,
      client: options?.client,
      batchSize: options?.batchSize,
      ignoreDuplicates: options?.ignoreDuplicates ?? true,
    };

    stats = await persistArticles(articles, persistOptions);
    persistDurationMs = Date.now() - persistStart;
  }

  const totalDurationMs = Date.now() - overallStart;
  stats.durationMs = totalDurationMs;

  return {
    provider: provider.name,
    articles,
    stats,
    timings: {
      fetchDurationMs,
      persistDurationMs,
      totalDurationMs,
    },
  };
}

export * from "./persistence";
