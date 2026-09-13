import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, InsertArticle, InsertSource, Json } from "@/types/database";
import type { NormalizedArticle } from "./types";
import { getServiceSupabaseClient } from "../supabase";
import { canonicalizeUrl, normalizeTitle } from "./deduplication";

export interface IngestionStats {
  provider: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs?: number;
  errors?: string[];
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
  supabase: SupabaseClient<Database>,
  errors?: string[]
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
    // 1. Check for existing sources in chunks to avoid URL size limits
    const extIdChunks = chunkArray(externalIds, 50);
    for (const chunk of extIdChunks) {
      const { data: existingSources, error: fetchErr } = await supabase
        .from("sources")
        .select("id, external_id")
        .eq("provider", provider)
        .in("external_id", chunk);

      if (fetchErr) {
        const msg = `[Persistence] Error querying existing sources for provider "${provider}": ${fetchErr.message} (code: ${fetchErr.code})`;
        console.error(msg, fetchErr);
        errors?.push(msg);
      } else if (existingSources) {
        for (const src of existingSources) {
          sourceMap.set(src.external_id, src.id);
        }
      }
    }

    // 2. Insert missing sources in chunks to avoid payload limits
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
      const missingChunks = chunkArray(missingSources, 50);
      for (const chunk of missingChunks) {
        const { data: insertedSources, error: insertErr } = await supabase
          .from("sources")
          .upsert(chunk, { onConflict: "provider,external_id" })
          .select("id, external_id");

        if (insertErr) {
          const msg = `[Persistence] Error inserting missing sources for provider "${provider}": ${insertErr.message} (code: ${insertErr.code})`;
          console.error(msg, insertErr);
          errors?.push(msg);
        } else if (insertedSources) {
          for (const src of insertedSources) {
            sourceMap.set(src.external_id, src.id);
          }
        }
      }
    }
  } catch (err) {
    const msg = `[Persistence] Source resolution exception for provider "${provider}": ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg, err);
    errors?.push(msg);
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
    errors: [],
  };

  if (articles.length === 0) {
    return stats;
  }

  // 1. Filter valid vs malformed articles and deduplicate within the input batch
  const validArticles: NormalizedArticle[] = [];
  const seenExternalIds = new Set<string>();
  const seenCanonicalUrls = new Set<string>();

  for (const article of articles) {
    if (!validateNormalizedArticle(article)) {
      stats.failed++;
      const msg = `[Persistence] Skipping invalid article from provider "${provider}": externalId="${(article as Record<string, unknown>)?.externalId || ""}", title="${(article as Record<string, unknown>)?.title || ""}"`;
      console.warn(msg, article);
      stats.errors?.push(msg);
      continue;
    }

    const canonicalUrl = canonicalizeUrl(article.url);
    const normalizedTitle = normalizeTitle(article.title);
    article.canonicalUrl = canonicalUrl || article.url;
    article.normalizedTitle = normalizedTitle || article.title;

    const trimmedId = article.externalId.trim();
    if (seenExternalIds.has(trimmedId) || (canonicalUrl && seenCanonicalUrls.has(canonicalUrl))) {
      if (ignoreDuplicates) {
        stats.skipped++;
      }
      continue;
    }

    seenExternalIds.add(trimmedId);
    if (canonicalUrl) {
      seenCanonicalUrls.add(canonicalUrl);
    }
    validArticles.push(article);
  }

  if (validArticles.length === 0) {
    return stats;
  }

  // 2. Resolve sources in batch
  const sourceIdMap = await resolveSources(validArticles, provider, client, stats.errors);

  // 3. Process in batches
  const batches = chunkArray(validArticles, batchSize);

  for (const batch of batches) {
    try {
      const batchExternalIds = batch.map((a) => a.externalId.trim());
      const batchCanonicalUrls = batch
        .map((a) => a.canonicalUrl)
        .filter((u): u is string => Boolean(u && u.length > 0));

      // Query which articles already exist in the database for this batch by (provider, external_id)
      const { data: existingByExtId, error: checkErr } = await client
        .from("articles")
        .select("external_id")
        .eq("provider", provider)
        .in("external_id", batchExternalIds);

      if (checkErr) {
        const msg = `[Persistence] Error checking existing articles for provider "${provider}": ${checkErr.message} (code: ${checkErr.code})`;
        console.error(msg, checkErr);
        stats.errors?.push(msg);
      }

      // Query which articles already exist in the database for this batch by canonical_url
      let existingByCanonicalUrl: { canonical_url: string | null }[] | null = null;
      if (batchCanonicalUrls.length > 0) {
        try {
          const { data: urlMatches } = await client
            .from("articles")
            .select("canonical_url")
            .in("canonical_url", batchCanonicalUrls);
          existingByCanonicalUrl = urlMatches;
        } catch {
          // Graceful fallback if canonical_url column is not yet queried
        }
      }

      const existingExtSet = new Set(
        (existingByExtId || []).map((row) => row.external_id)
      );
      const existingUrlSet = new Set(
        (existingByCanonicalUrl || [])
          .map((row) => row.canonical_url)
          .filter((u): u is string => Boolean(u))
      );

      const recordsToUpsert: InsertArticle[] = [];
      let newCount = 0;
      let existingCount = 0;

      for (const article of batch) {
        const extId = article.externalId.trim();
        const canonical = article.canonicalUrl || article.url;
        const isExisting =
          existingExtSet.has(extId) ||
          Boolean(canonical && existingUrlSet.has(canonical));

        if (isExisting) {
          existingCount++;
          if (ignoreDuplicates) {
            continue;
          }
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
          normalized_title: article.normalizedTitle || normalizeTitle(article.title),
          description: article.description?.trim() || null,
          content: article.content?.trim() || null,
          url: article.url.trim(),
          canonical_url: canonical,
          image_url: article.imageUrl?.trim() || null,
          author: article.author?.trim() || null,
          published_at: article.publishedAt.toISOString(),
          fetched_at: new Date().toISOString(),
          language: article.language?.trim() || null,
          raw_data: (article.rawData as Json) || null,
        });
      }

      if (recordsToUpsert.length > 0) {
        // Perform batch upsert
        const { error: upsertErr } = await client
          .from("articles")
          .upsert(recordsToUpsert, {
            onConflict: "provider,external_id",
            ignoreDuplicates,
          });

        if (upsertErr) {
          // If upsert fails because canonical_url / normalized_title column doesn't exist yet
          if (
            upsertErr.message.includes("canonical_url") ||
            upsertErr.message.includes("normalized_title") ||
            upsertErr.code === "42703"
          ) {
            const fallbackRecords = recordsToUpsert.map((r) => {
              const rest = { ...r };
              delete rest.canonical_url;
              delete rest.normalized_title;
              return rest;
            });

            const { error: fallbackErr } = await client
              .from("articles")
              .upsert(fallbackRecords as InsertArticle[], {
                onConflict: "provider,external_id",
                ignoreDuplicates,
              });

            if (fallbackErr) {
              const msg = `[Persistence] Batch fallback upsert error for provider "${provider}": ${fallbackErr.message}`;
              console.error(msg, fallbackErr);
              stats.errors?.push(msg);
              stats.failed += recordsToUpsert.length;
            } else {
              stats.inserted += newCount;
              if (ignoreDuplicates) {
                stats.skipped += existingCount;
              } else {
                stats.updated += existingCount;
              }
            }
          } else {
            const msg = `[Persistence] Batch upsert error for provider "${provider}": ${upsertErr.message} (code: ${upsertErr.code}${upsertErr.details ? `, details: ${upsertErr.details}` : ""})`;
            console.error(msg, upsertErr);
            stats.errors?.push(msg);
            stats.failed += recordsToUpsert.length;
          }
        } else {
          stats.inserted += newCount;
          if (ignoreDuplicates) {
            stats.skipped += existingCount;
          } else {
            stats.updated += existingCount;
          }
        }
      } else {
        if (ignoreDuplicates) {
          stats.skipped += existingCount;
        }
      }
    } catch (batchErr) {
      const msg = `[Persistence] Unexpected batch error for provider "${provider}": ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`;
      console.error(msg, batchErr);
      stats.errors?.push(msg);
      stats.failed += batch.length;
    }
  }

  return stats;
}
