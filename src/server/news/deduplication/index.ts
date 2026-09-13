export * from "./canonicalize";
export * from "./normalize-title";
export * from "./similarity";

import { canonicalizeUrl } from "./canonicalize";
import { normalizeTitle } from "./normalize-title";
import type { NormalizedArticle } from "../types";

export interface IntraBatchDeduplicationResult {
  uniqueArticles: NormalizedArticle[];
  skippedCount: number;
  duplicateMap: Map<string, string>; // duplicate externalId -> keeper externalId
}

/**
 * Deduplicates articles within an incoming batch before hitting the database.
 * Filters out items with duplicate (provider, externalId) or duplicate canonicalUrl.
 */
export function deduplicateIntraBatch(
  articles: NormalizedArticle[],
  provider?: string
): IntraBatchDeduplicationResult {
  void provider;
  const seenExternalIds = new Set<string>();
  const seenCanonicalUrls = new Map<string, string>(); // canonicalUrl -> externalId
  const uniqueArticles: NormalizedArticle[] = [];
  const duplicateMap = new Map<string, string>();
  let skippedCount = 0;

  for (const article of articles) {
    const extId = article.externalId.trim();

    // Check 1: Provider + externalId within the batch
    if (seenExternalIds.has(extId)) {
      skippedCount++;
      duplicateMap.set(extId, extId);
      continue;
    }

    // Check 2: Canonical URL within the batch
    const canonical = canonicalizeUrl(article.url);
    if (canonical && seenCanonicalUrls.has(canonical)) {
      const existingId = seenCanonicalUrls.get(canonical)!;
      skippedCount++;
      duplicateMap.set(extId, existingId);
      continue;
    }

    seenExternalIds.add(extId);
    if (canonical) {
      seenCanonicalUrls.set(canonical, extId);
    }

    uniqueArticles.push({
      ...article,
      canonicalUrl: canonical || article.url,
      normalizedTitle: normalizeTitle(article.title),
    });
  }

  return {
    uniqueArticles,
    skippedCount,
    duplicateMap,
  };
}
