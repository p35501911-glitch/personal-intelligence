import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import { getTaxonomyIndex } from "../categories/keywords";
import {
  computeUserRelevance,
  type RelevanceScoreResult,
  type StoryCategoryTag,
} from "./scorer";

export interface PersonalizedStoryItem {
  id: string;
  canonicalTitle: string;
  summary: string | null;
  firstPublishedAt: string;
  latestPublishedAt: string;
  articleCount: number;
  sourceCount: number;
  importanceScore: number | null;
  status: string;
  relevance: RelevanceScoreResult;
}

export interface PersonalizedFeedOptions {
  userId?: string | null;
  userCategoryIds?: string[];
  selectionMode?: "CATEGORY" | "ALL";
  limit?: number;
  offset?: number;
  minThreshold?: number;
  windowDays?: number; // Time window for candidate stories (default 7 days)
  client?: SupabaseClient<Database>;
}

export interface PersonalizedFeedResult {
  stories: PersonalizedStoryItem[];
  limit: number;
  offset: number;
  count: number;
  mode: "CATEGORY" | "ALL";
  userCategoryCount: number;
}

interface JoinedCategoryRow {
  id: string;
  name: string;
  slug: string;
  level: number;
  parent_id: string | null;
}

interface StoryCategoryJoinRow {
  story_id: string;
  category_id: string;
  confidence: number | string;
  is_primary: boolean;
  categories: JoinedCategoryRow | JoinedCategoryRow[] | null;
}

/**
 * Resolves a user's category preferences from Supabase.
 */
export async function getUserPreferencesData(
  userId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<{ mode: "CATEGORY" | "ALL"; categoryIds: string[] }> {
  try {
    // 1. Fetch selection mode
    const { data: prefData } = await client
      .from("user_preferences")
      .select("category_selection_mode")
      .eq("user_id", userId)
      .maybeSingle();

    const mode = (prefData?.category_selection_mode as "CATEGORY" | "ALL") || "CATEGORY";

    if (mode === "ALL") {
      return { mode: "ALL", categoryIds: [] };
    }

    // 2. Fetch category IDs
    const { data: catRows } = await client
      .from("user_category_preferences")
      .select("category_id")
      .eq("user_id", userId);

    const categoryIds = (catRows || []).map((r) => r.category_id);
    return { mode: "CATEGORY", categoryIds };
  } catch (err) {
    console.warn(`[Relevance Service] Notice fetching user preferences for ${userId}:`, err);
    return { mode: "CATEGORY", categoryIds: [] };
  }
}

/**
 * Builds the user's personalized intelligence feed.
 *
 * Flow:
 * 1. Resolves user preferences (mode and up to 5 category IDs).
 * 2. Fetches active candidate stories published within time window.
 * 3. Fetches attached categories for these stories.
 * 4. Computes deterministic relevance score for each candidate.
 * 5. Filters non-relevant stories and sorts by relevance DESC.
 * 6. Returns paginated results with explanations.
 */
export async function getUserPersonalizedFeed(
  options: PersonalizedFeedOptions = {},
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<PersonalizedFeedResult> {
  const {
    userId,
    limit = 20,
    offset = 0,
    minThreshold = 0.15,
    windowDays = 7,
  } = options;

  let mode = options.selectionMode || "CATEGORY";
  let categoryIds = options.userCategoryIds || [];

  // If userId provided and categories not explicitly passed, load from DB
  if (userId && (!options.userCategoryIds || options.userCategoryIds.length === 0)) {
    const prefs = await getUserPreferencesData(userId, client);
    mode = prefs.mode;
    categoryIds = prefs.categoryIds;
  }

  // 1. Fetch active candidate stories within time window
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const storiesQuery = client
    .from("stories")
    .select("id, canonical_title, summary, first_published_at, latest_published_at, article_count, source_count, importance_score, status")
    .eq("status", "active")
    .gte("latest_published_at", windowStart)
    .order("latest_published_at", { ascending: false })
    .limit(100);

  const { data: rawStories, error: storiesErr } = await storiesQuery;

  if (storiesErr || !rawStories || rawStories.length === 0) {
    return {
      stories: [],
      limit,
      offset,
      count: 0,
      mode,
      userCategoryCount: categoryIds.length,
    };
  }

  const storyIds = rawStories.map((s) => s.id);

  // 2. Fetch categories for these candidate stories
  const { data: rawStoryCategories } = await client
    .from("story_categories")
    .select(`
      story_id,
      category_id,
      confidence,
      is_primary,
      categories (
        id,
        name,
        slug,
        level,
        parent_id
      )
    `)
    .in("story_id", storyIds);

  const { categoryMap, slugMap } = getTaxonomyIndex();

  // Group categories by story_id
  const categoriesByStory = new Map<string, StoryCategoryTag[]>();

  const rows = (rawStoryCategories || []) as unknown as StoryCategoryJoinRow[];
  for (const row of rows) {
    const catObj = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    if (!catObj) continue;

    // Lookup taxonomy index to get root info
    const indexed = slugMap.get(catObj.slug) || categoryMap.get(catObj.id);

    const tag: StoryCategoryTag = {
      categoryId: catObj.id,
      categorySlug: catObj.slug,
      categoryName: catObj.name,
      rootId: indexed?.rootId,
      rootSlug: indexed ? categoryMap.get(indexed.rootId)?.slug : undefined,
      level: (catObj.level as 1 | 2 | 3) || 1,
      confidence: Number(row.confidence),
      isPrimary: row.is_primary,
    };

    if (!categoriesByStory.has(row.story_id)) {
      categoriesByStory.set(row.story_id, []);
    }
    categoriesByStory.get(row.story_id)!.push(tag);
  }

  // 3. Compute relevance for each candidate story
  const scoredStories: PersonalizedStoryItem[] = [];

  for (const storyRow of rawStories) {
    const tags = categoriesByStory.get(storyRow.id) || [];

    const relevance = computeUserRelevance(
      {
        userCategoryIds: categoryIds,
        selectionMode: mode,
        story: {
          id: storyRow.id,
          canonicalTitle: storyRow.canonical_title,
          summary: storyRow.summary,
          firstPublishedAt: new Date(storyRow.first_published_at),
          latestPublishedAt: new Date(storyRow.latest_published_at),
          articleCount: storyRow.article_count,
          sourceCount: storyRow.source_count,
          importanceScore: storyRow.importance_score ? Number(storyRow.importance_score) : null,
          categories: tags,
        },
      },
      { minThreshold }
    );

    // In CATEGORY mode, exclude stories with 0 relevance
    if (mode === "CATEGORY" && !relevance.isRelevant) {
      continue;
    }

    scoredStories.push({
      id: storyRow.id,
      canonicalTitle: storyRow.canonical_title,
      summary: storyRow.summary,
      firstPublishedAt: storyRow.first_published_at,
      latestPublishedAt: storyRow.latest_published_at,
      articleCount: storyRow.article_count,
      sourceCount: storyRow.source_count,
      importanceScore: storyRow.importance_score ? Number(storyRow.importance_score) : null,
      status: storyRow.status,
      relevance,
    });
  }

  // 4. Rank: primary sort by relevance.score DESC, tiebreak by latestPublishedAt DESC
  scoredStories.sort((a, b) => {
    if (b.relevance.score !== a.relevance.score) {
      return b.relevance.score - a.relevance.score;
    }
    return new Date(b.latestPublishedAt).getTime() - new Date(a.latestPublishedAt).getTime();
  });

  const totalCount = scoredStories.length;
  const paginated = scoredStories.slice(offset, offset + limit);

  return {
    stories: paginated,
    limit,
    offset,
    count: totalCount,
    mode,
    userCategoryCount: categoryIds.length,
  };
}
