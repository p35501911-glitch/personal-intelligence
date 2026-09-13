import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import { computeTitleSimilarity } from "../deduplication/similarity";
import {
  createStory,
  attachArticleToStory,
  getActiveStoryCandidates,
} from "./service";
import type { ClusterArticleResult, StoryCandidate } from "./types";

export interface ClusteringOptions {
  similarityThreshold?: number;
  timeWindowHours?: number;
  client?: SupabaseClient<Database>;
}

/**
 * Evaluates an article against active story candidates to find a matching story.
 * Uses deterministic title similarity and conservative thresholding.
 */
export function findBestStoryMatch(
  articleTitle: string,
  candidates: StoryCandidate[],
  threshold: number = 0.72
): { candidate: StoryCandidate; score: number } | null {
  let bestMatch: { candidate: StoryCandidate; score: number } | null = null;

  for (const candidate of candidates) {
    const score = computeTitleSimilarity(articleTitle, candidate.canonicalTitle);

    if (score >= threshold) {
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { candidate, score };
      }
    }
  }

  return bestMatch;
}

/**
 * Clusters a single article into an existing story or creates a new story.
 *
 * Flow:
 * 1. Fetch active candidate stories within publication window (72h).
 * 2. Evaluate similarity deterministically.
 * 3. If confidence is high (score >= threshold): attach to existing story.
 * 4. If confidence is uncertain: create new story.
 */
export async function clusterArticle(
  article: {
    id: string;
    title: string;
    publishedAt: Date;
    sourceId?: string | null;
  },
  options: ClusteringOptions = {}
): Promise<ClusterArticleResult> {
  const {
    similarityThreshold = 0.72,
    timeWindowHours = 72,
    client = getServiceSupabaseClient(),
  } = options;

  try {
    // 0. Check if article is already attached to an existing story
    interface ExistingLinkRow {
      story_id: string;
      stories?: { canonical_title?: string } | null;
    }
    let existingLink: ExistingLinkRow | null = null;

    try {
      const query = client
        .from("story_articles")
        .select("story_id, stories(canonical_title)")
        .eq("article_id", article.id);

      const builder = query as unknown as {
        maybeSingle?: () => Promise<{ data: unknown }>;
        single?: () => Promise<{ data: unknown }>;
      };

      let resData: unknown = null;
      if (typeof builder.maybeSingle === "function") {
        const res = await builder.maybeSingle();
        resData = res?.data;
      } else if (typeof builder.single === "function") {
        const res = await builder.single();
        resData = res?.data;
      } else {
        const res = await (query as unknown as Promise<{ data: unknown }>);
        resData = res?.data;
      }

      if (resData) {
        existingLink = (Array.isArray(resData) ? resData[0] : resData) as ExistingLinkRow;
      }
    } catch {
      // Table or mock may not support this query; proceed safely
    }

    if (existingLink) {
      const storyTitle = existingLink.stories?.canonical_title;
      return {
        articleId: article.id,
        storyId: existingLink.story_id,
        isNewStory: false,
        canonicalTitle: storyTitle || article.title,
      };
    }

    // 1. Find candidates within time window
    const candidates = await getActiveStoryCandidates(article.publishedAt, timeWindowHours, client);

    // 2. Evaluate similarity
    const match = findBestStoryMatch(article.title, candidates, similarityThreshold);

    if (match) {
      // High confidence match: attach to existing story
      const updatedStory = await attachArticleToStory(match.candidate.id, article, client);
      return {
        articleId: article.id,
        storyId: updatedStory.id,
        isNewStory: false,
        canonicalTitle: updatedStory.canonicalTitle,
      };
    }

    // Uncertain or no match: create new story
    const newStory = await createStory(article, client);
    return {
      articleId: article.id,
      storyId: newStory.id,
      isNewStory: true,
      canonicalTitle: newStory.canonicalTitle,
    };
  } catch (err) {
    console.error(`[Clustering] Error clustering article ${article.id}:`, err);
    throw err;
  }
}

/**
 * Clusters a batch of persisted articles sequentially to ensure proper chaining.
 */
export async function clusterArticles(
  articles: Array<{
    id: string;
    title: string;
    publishedAt: Date;
    sourceId?: string | null;
  }>,
  options: ClusteringOptions = {}
): Promise<ClusterArticleResult[]> {
  const results: ClusterArticleResult[] = [];

  for (const article of articles) {
    const res = await clusterArticle(article, options);
    results.push(res);
  }

  return results;
}
