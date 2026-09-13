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
  title: string;
  canonicalTitle: string;
  summary: string | null;
  imageUrl: string | null;
  firstPublishedAt: string;
  latestPublishedAt: string;
  articleCount: number;
  sourceCount: number;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  importanceScore: number | null;
  categories: StoryCategoryTag[];
  sources: Array<{ id: string; name: string; url: string | null }>;
  status: string;
  relevance: RelevanceScoreResult;
  feedScore: number;
}

export interface PersonalizedFeedOptions {
  userId?: string | null;
  userCategoryIds?: string[];
  selectionMode?: "CATEGORY" | "ALL";
  limit?: number;
  offset?: number;
  minThreshold?: number;
  windowDays?: number; // Time window for candidate stories (default 7 days)
  sortBy?: "relevance" | "recent" | "importance";
  minImportance?: number;
  client?: SupabaseClient<Database>;
}

export interface PersonalizedFeedResult {
  stories: PersonalizedStoryItem[];
  limit: number;
  offset: number;
  count: number;
  hasMore: boolean;
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
    mode = options.selectionMode || prefs.mode;
    categoryIds = prefs.categoryIds;
  }

  // If in CATEGORY mode and user has 0 categories selected, return empty feed immediately
  if (mode === "CATEGORY" && categoryIds.length === 0) {
    return {
      stories: [],
      limit,
      offset,
      count: 0,
      hasMore: false,
      mode: "CATEGORY",
      userCategoryCount: 0,
    };
  }

  // Expand category IDs to include both IDs and slugs for hierarchy matching
  const { categoryMap, slugMap } = getTaxonomyIndex();
  const effectiveCategoryIds = new Set<string>(categoryIds);
  for (const id of categoryIds) {
    const rule = slugMap.get(id) || categoryMap.get(id);
    if (rule) {
      effectiveCategoryIds.add(rule.slug);
      effectiveCategoryIds.add(rule.id);
    }
  }
  const matchingCategoryIds = Array.from(effectiveCategoryIds);

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

  function getImportanceLevel(score: number | null): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
    if (score === null || score === undefined) return "LOW";
    if (score >= 0.8) return "CRITICAL";
    if (score >= 0.6) return "HIGH";
    if (score >= 0.4) return "MEDIUM";
    return "LOW";
  }

  if (storiesErr || !rawStories || rawStories.length === 0) {
    return {
      stories: [],
      limit,
      offset,
      count: 0,
      hasMore: false,
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

  // Group categories by story_id
  const categoriesByStory = new Map<string, StoryCategoryTag[]>();

  const rows = (rawStoryCategories || []) as unknown as StoryCategoryJoinRow[];
  for (const row of rows) {
    const catObj = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    const indexed =
      (catObj?.slug && slugMap.get(catObj.slug)) ||
      (catObj?.id && categoryMap.get(catObj.id)) ||
      slugMap.get(row.category_id) ||
      categoryMap.get(row.category_id);

    if (!catObj && !indexed) continue;

    const resolvedId = catObj?.id || indexed?.id || row.category_id;
    const resolvedSlug = catObj?.slug || indexed?.slug || row.category_id;
    const resolvedName = catObj?.name || indexed?.name || resolvedSlug;
    const resolvedLevel = (catObj?.level as 1 | 2 | 3) || indexed?.level || 1;

    const tag: StoryCategoryTag = {
      categoryId: resolvedId,
      categorySlug: resolvedSlug,
      categoryName: resolvedName,
      rootId: indexed?.rootId,
      rootSlug: indexed ? (categoryMap.get(indexed.rootId)?.slug || indexed.rootId) : undefined,
      parentId: catObj?.parent_id || indexed?.parentId,
      parentSlug: indexed?.parentId ? (categoryMap.get(indexed.parentId)?.slug || indexed.parentId) : undefined,
      level: resolvedLevel,
      confidence: Number(row.confidence),
      isPrimary: row.is_primary,
    };

    if (!categoriesByStory.has(row.story_id)) {
      categoriesByStory.set(row.story_id, []);
    }
    categoriesByStory.get(row.story_id)!.push(tag);
  }

  // 2b. Fetch primary images and publisher sources for candidate stories in a single batch
  const storyMediaMap = new Map<
    string,
    { imageUrl: string | null; sources: Array<{ id: string; name: string; url: string | null }> }
  >();

  try {
    const tableQuery = client?.from?.("story_articles");
    if (tableQuery && typeof tableQuery.select === "function") {
      const { data: rawArticles } = await tableQuery
        .select(`
          story_id,
          articles (
            id,
            image_url,
            source_id,
            sources (
              id,
              name,
              url
            )
          )
        `)
        .in("story_id", storyIds);

      interface JoinedArticleData {
        story_id: string;
        articles: {
          id: string;
          image_url: string | null;
          source_id: string | null;
          sources: {
            id: string;
            name: string;
            url: string | null;
          } | null;
        } | null;
      }

      const articleRows = (rawArticles || []) as unknown as JoinedArticleData[];
      for (const r of articleRows) {
        if (!storyMediaMap.has(r.story_id)) {
          storyMediaMap.set(r.story_id, { imageUrl: null, sources: [] });
        }
        const entry = storyMediaMap.get(r.story_id)!;
        if (r.articles) {
          if (!entry.imageUrl && r.articles.image_url) {
            entry.imageUrl = r.articles.image_url;
          }
          if (r.articles.sources) {
            const src = r.articles.sources;
            if (!entry.sources.some((s) => s.id === src.id)) {
              entry.sources.push({ id: src.id, name: src.name, url: src.url });
            }
          }
        }
      }
    }
  } catch (mediaErr) {
    console.warn("[Relevance Service] Non-fatal error fetching story media/sources:", mediaErr);
  }

  // 3. Compute relevance for each candidate story
  const scoredStories: PersonalizedStoryItem[] = [];

  for (const storyRow of rawStories) {
    const tags = categoriesByStory.get(storyRow.id) || [];

    const relevance = computeUserRelevance(
      {
        userCategoryIds: matchingCategoryIds,
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

    const importanceVal = storyRow.importance_score ? Number(storyRow.importance_score) : 0.5;
    const feedScore =
      mode === "ALL"
        ? Number((0.2 * relevance.score + 0.8 * importanceVal).toFixed(3))
        : Number((0.65 * relevance.score + 0.35 * importanceVal).toFixed(3));

    const media = storyMediaMap.get(storyRow.id) || { imageUrl: null, sources: [] };
    const impScore = storyRow.importance_score ? Number(storyRow.importance_score) : null;
    const importanceLevel = getImportanceLevel(impScore);

    scoredStories.push({
      id: storyRow.id,
      title: storyRow.canonical_title,
      canonicalTitle: storyRow.canonical_title,
      summary: storyRow.summary,
      imageUrl: media.imageUrl,
      firstPublishedAt: storyRow.first_published_at,
      latestPublishedAt: storyRow.latest_published_at,
      articleCount: storyRow.article_count,
      sourceCount: storyRow.source_count,
      importance: importanceLevel,
      importanceScore: impScore,
      categories: tags,
      sources: media.sources,
      status: storyRow.status,
      relevance,
      feedScore,
    });
  }

  // 4. Filter by minImportance if specified
  const filteredStories =
    options.minImportance !== undefined && options.minImportance !== null
      ? scoredStories.filter((s) => (s.importanceScore ?? 0) >= options.minImportance!)
      : scoredStories;

  // 5. Sort
  const sortBy = options.sortBy || "relevance";
  filteredStories.sort((a, b) => {
    if (sortBy === "recent") {
      return new Date(b.latestPublishedAt).getTime() - new Date(a.latestPublishedAt).getTime();
    }
    if (sortBy === "importance") {
      const impA = a.importanceScore ?? 0;
      const impB = b.importanceScore ?? 0;
      if (impB !== impA) return impB - impA;
      return new Date(b.latestPublishedAt).getTime() - new Date(a.latestPublishedAt).getTime();
    }
    // Default: relevance (feedScore DESC)
    if (b.feedScore !== a.feedScore) {
      return b.feedScore - a.feedScore;
    }
    if (b.relevance.score !== a.relevance.score) {
      return b.relevance.score - a.relevance.score;
    }
    return new Date(b.latestPublishedAt).getTime() - new Date(a.latestPublishedAt).getTime();
  });

  const totalCount = filteredStories.length;
  const paginated = filteredStories.slice(offset, offset + limit);
  const hasMore = offset + limit < totalCount;

  return {
    stories: paginated,
    limit,
    offset,
    count: totalCount,
    hasMore,
    mode,
    userCategoryCount: categoryIds.length,
  };
}
