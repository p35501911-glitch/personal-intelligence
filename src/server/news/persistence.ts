import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, InsertArticle, InsertSource, Json } from "@/types/database";
import type { NormalizedArticle } from "./types";
import { getServiceSupabaseClient } from "../supabase";

export interface IngestionStats {
  provider: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs?: number;
}

export interface PersistArticlesOptions {
  provider: string;
  client?: SupabaseClient<Database>;
  batchSize?: number;
  ignoreDuplicates?: boolean;
}

/**
 * Validates that an article contains the minimum required fields for persistence.
 */
export function validateNormalizedArticle(
  article: unknown
): article is NormalizedArticle {
  if (!article || typeof article !== "object") return false;
  const candidate = article as Record<string, unknown>;

  if (
    typeof candidate.externalId !== "string" ||
    candidate.externalId.trim().length === 0
  ) {
    return false;
  }

  if (
    typeof candidate.title !== "string" ||
    candidate.title.trim().length === 0
  ) {
    return false;
  }

  if (
    typeof candidate.url !== "string" ||
    candidate.url.trim().length === 0
  ) {
    return false;
  }

  if (
    !(candidate.publishedAt instanceof Date) ||
    isNaN(candidate.publishedAt.getTime())
  ) {
    return false;
  }

  return true;
}

/**
 * Resolves source records in batch. For any source that does not exist in the database,
 * inserts a new record under (provider, external_id) and returns a map of external_id -> UUID.
 */
export async function resolveSources(
  articles: NormalizedArticle[],
  provider: string,
  supabase: SupabaseClient<Database>
): Promise<Map<string, string>> {
  const sourceMap = new Map<string, string>();
  const uniqueSourcesMap = new Map<
    string,
    { externalId: string; name: string; url: string | null }
  >();

  for (const article of articles) {
    if (article.source && article.source.externalId) {
      const extId = article.source.externalId.trim();
      if (extId.length > 0 && !uniqueSourcesMap.has(extId)) {
        uniqueSourcesMap.set(extId, {
          externalId: extId,
          name: article.source.name?.trim() || extId,
          url: article.source.url?.trim() || null,
        });
      }
    }
  }

  const externalIds = Array.from(uniqueSourcesMap.keys());
  if (externalIds.length === 0) {
    return sourceMap;
  }

  try {
    // 1. Check for existing sources
    const { data: existingSources, error: fetchErr } = await supabase
      .from("sources")
      .select("id, external_id")
      .eq("provider", provider)
      .in("external_id", externalIds);

    if (fetchErr) {
      console.error("[Persistence] Error querying existing sources:", fetchErr);
    } else if (existingSources) {
      for (const src of existingSources) {
        sourceMap.set(src.external_id, src.id);
      }
    }

    // 2. Insert missing sources
    const missingSources: InsertSource[] = [];
    for (const extId of externalIds) {
      if (!sourceMap.has(extId)) {
        const item = uniqueSourcesMap.get(extId)!;
        missingSources.push({
          provider,
          external_id: item.externalId,
          name: item.name,
          url: item.url,
          is_active: true,
        });
      }
    }

    if (missingSources.length > 0) {
      const { data: insertedSources, error: insertErr } = await supabase
        .from("sources")
        .upsert(missingSources, { onConflict: "provider,external_id" })
        .select("id, external_id");

      if (insertErr) {
        console.error("[Persistence] Error inserting missing sources:", insertErr);
      } else if (insertedSources) {
        for (const src of insertedSources) {
          sourceMap.set(src.external_id, src.id);
        }
      }
    }
  } catch (err) {
    console.error("[Persistence] Source resolution exception:", err);
  }

  return sourceMap;
}

/**
 * Chunks an array into smaller sub-arrays of specified size.
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Persists an array of normalized articles into Supabase PostgreSQL.
 *
 * - Provider-independent: works with any provider producing NormalizedArticle.
 * - Idempotent: uses (provider, external_id) unique constraint.
 * - Batched: avoids N+1 database operations by resolving sources and upserting in chunks.
 * - Resilient: malformed articles are counted as failed without crashing the run.
 */
export async function persistArticles(
  articles: NormalizedArticle[],
  options: PersistArticlesOptions
): Promise<IngestionStats> {
  const {
    provider,
    client = getServiceSupabaseClient(),
    batchSize = 50,
    ignoreDuplicates = true,
  } = options;

  const stats: IngestionStats = {
    provider,
    fetched: articles.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  if (articles.length === 0) {
    return stats;
  }

  // 1. Filter valid vs malformed articles
  const validArticles: NormalizedArticle[] = [];
  for (const article of articles) {
    if (validateNormalizedArticle(article)) {
      validArticles.push(article);
    } else {
      stats.failed++;
      console.warn(
        `[Persistence] Skipping invalid article from provider "${provider}":`,
        article
      );
    }
  }

  if (validArticles.length === 0) {
    return stats;
  }

  // 2. Resolve sources in batch
  const sourceIdMap = await resolveSources(validArticles, provider, client);

  // 3. Process in batches
  const batches = chunkArray(validArticles, batchSize);

  for (const batch of batches) {
    try {
      const batchExternalIds = batch.map((a) => a.externalId.trim());

      // Query which articles already exist in the database for this batch
      const { data: existingRows, error: checkErr } = await client
        .from("articles")
        .select("external_id")
        .eq("provider", provider)
        .in("external_id", batchExternalIds);

      if (checkErr) {
        console.error(
          `[Persistence] Error checking existing articles for provider "${provider}":`,
          checkErr
        );
      }

      const existingSet = new Set(
        (existingRows || []).map((row) => row.external_id)
      );

      const recordsToUpsert: InsertArticle[] = [];
      let newCount = 0;
      let existingCount = 0;

      for (const article of batch) {
        const extId = article.externalId.trim();
        const isExisting = existingSet.has(extId);

        if (isExisting) {
          existingCount++;
        } else {
          newCount++;
        }

        const sourceId =
          (article.source?.externalId &&
            sourceIdMap.get(article.source.externalId.trim())) ||
          null;

        recordsToUpsert.push({
          provider,
          external_id: extId,
          source_id: sourceId,
          title: article.title.trim(),
          description: article.description?.trim() || null,
          content: article.content?.trim() || null,
          url: article.url.trim(),
          image_url: article.imageUrl?.trim() || null,
          author: article.author?.trim() || null,
          published_at: article.publishedAt.toISOString(),
          fetched_at: new Date().toISOString(),
          language: article.language?.trim() || null,
          raw_data: (article.rawData as Json) || null,
        });
      }

      // Perform batch upsert
      const { error: upsertErr } = await client
        .from("articles")
        .upsert(recordsToUpsert, {
          onConflict: "provider,external_id",
          ignoreDuplicates,
        });

      if (upsertErr) {
        console.error(
          `[Persistence] Batch upsert error for provider "${provider}":`,
          upsertErr
        );
        stats.failed += batch.length;
      } else {
        stats.inserted += newCount;
        if (ignoreDuplicates) {
          stats.skipped += existingCount;
        } else {
          stats.updated += existingCount;
        }
      }
    } catch (batchErr) {
      console.error(
        `[Persistence] Unexpected batch error for provider "${provider}":`,
        batchErr
      );
      stats.failed += batch.length;
    }
  }

  return stats;
}
