import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import { getTaxonomyIndex } from "../categories/keywords";
import type { StoryCategoryTag } from "../relevance/scorer";
import type { StoryIntelligenceDetail } from "../stories";
import type { SavedStoryItem, SavedStoriesFetchOptions, SavedStoriesResult } from "./types";

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

function getImportanceLevel(score: number | null): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score === null || score === undefined) return "LOW";
  if (score >= 0.8) return "CRITICAL";
  if (score >= 0.6) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

/**
 * Saves/bookmarks a story for an authenticated user.
 * Idempotent operation: duplicate calls safely succeed.
 */
export async function saveStory(
  userId: string,
  storyId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<{ id: string; userId: string; storyId: string; createdAt: string }> {
  if (!userId) throw new Error("userId is required to save a story");
  if (!storyId) throw new Error("storyId is required to save a story");

  const { data, error } = await client
    .from("user_saved_stories")
    .upsert(
      { user_id: userId, story_id: storyId },
      { onConflict: "user_id,story_id" }
    )
    .select("id, user_id, story_id, created_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save story: ${error?.message || "Unknown error"}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    storyId: data.story_id,
    createdAt: data.created_at,
  };
}

/**
 * Removes a saved/bookmarked story for an authenticated user.
 * Idempotent: deleting a nonexistent bookmark succeeds without error.
 */
export async function unsaveStory(
  userId: string,
  storyId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<{ success: boolean; storyId: string }> {
  if (!userId) throw new Error("userId is required to unsave a story");
  if (!storyId) throw new Error("storyId is required to unsave a story");

  const { error } = await client
    .from("user_saved_stories")
    .delete()
    .eq("user_id", userId)
    .eq("story_id", storyId);

  if (error) {
    throw new Error(`Failed to remove saved story: ${error.message}`);
  }

  return { success: true, storyId };
}

/**
 * Checks if a specific story is saved by an authenticated user.
 */
export async function isStorySaved(
  userId: string,
  storyId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<boolean> {
  if (!userId || !storyId) return false;

  try {
    const { data } = await client
      .from("user_saved_stories")
      .select("id")
      .eq("user_id", userId)
      .eq("story_id", storyId)
      .maybeSingle();

    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Batch lookup of saved story IDs for an authenticated user.
 * Avoids N+1 queries when loading feeds.
 */
export async function getSavedStoryIds(
  userId: string,
  storyIds: string[],
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!userId || !storyIds || storyIds.length === 0) return set;

  try {
    const { data } = await client
      .from("user_saved_stories")
      .select("story_id")
      .eq("user_id", userId)
      .in("story_id", storyIds);

    for (const row of data || []) {
      set.add(row.story_id);
    }
  } catch (err) {
    console.warn("[Saved Stories Service] Non-fatal error in batch lookup:", err);
  }

  return set;
}

/**
 * Retrieves the authenticated user's saved stories dossier with full intelligence,
 * category taxonomy tags, and multi-publisher consensus.
 */
export async function getSavedStories(
  userId: string,
  options: Omit<SavedStoriesFetchOptions, "userId"> = {},
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<SavedStoriesResult> {
  const { limit = 20, offset = 0 } = options;

  if (!userId) {
    return {
      stories: [],
      pagination: { limit, offset, count: 0, hasMore: false },
    };
  }

  // 1. Fetch saved records ordered by bookmark creation date DESC
  const { data: bookmarkRows, error: bookmarkErr } = await client
    .from("user_saved_stories")
    .select("id, story_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (bookmarkErr || !bookmarkRows || bookmarkRows.length === 0) {
    return {
      stories: [],
      pagination: { limit, offset, count: 0, hasMore: false },
    };
  }

  const totalCount = bookmarkRows.length;
  const paginatedBookmarks = bookmarkRows.slice(offset, offset + limit);
  const hasMore = offset + limit < totalCount;

  const storyIds = paginatedBookmarks.map((b) => b.story_id);
  const bookmarkMap = new Map<string, { id: string; createdAt: string }>();
  for (const b of paginatedBookmarks) {
    bookmarkMap.set(b.story_id, { id: b.id, createdAt: b.created_at });
  }

  // 2. Batch fetch stories
  const { data: rawStories, error: storiesErr } = await client
    .from("stories")
    .select("id, canonical_title, summary, first_published_at, latest_published_at, article_count, source_count, importance_score, status")
    .in("id", storyIds);

  if (storiesErr || !rawStories || rawStories.length === 0) {
    return {
      stories: [],
      pagination: { limit, offset, count: totalCount, hasMore },
    };
  }

  const storiesById = new Map<string, (typeof rawStories)[0]>();
  for (const s of rawStories) {
    storiesById.set(s.id, s);
  }

  // 3. Batch fetch categories for these stories
  const { categoryMap, slugMap } = getTaxonomyIndex();
  const categoriesByStory = new Map<string, StoryCategoryTag[]>();

  try {
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
  } catch (catErr) {
    console.warn("[Saved Stories Service] Non-fatal error fetching categories:", catErr);
  }

  // 4. Batch fetch media and publisher sources
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
    console.warn("[Saved Stories Service] Non-fatal error fetching media:", mediaErr);
  }

  // 5. Batch fetch completed AI intelligence
  const intelligenceByStory = new Map<string, StoryIntelligenceDetail>();
  try {
    const intelQuery = client?.from?.("story_intelligence");
    if (intelQuery && typeof intelQuery.select === "function") {
      const { data: rawIntel } = await intelQuery
        .select("story_id, summary, key_points, why_it_matters, opportunities, risks, model, tier, status, generated_at")
        .in("story_id", storyIds)
        .eq("status", "completed");

      for (const row of (rawIntel || []) as Array<{
        story_id: string;
        summary: string;
        key_points: string[] | unknown;
        why_it_matters: string | null;
        opportunities: string[] | unknown;
        risks: string[] | unknown;
        model: string;
        tier: string | null;
        generated_at: string;
      }>) {
        intelligenceByStory.set(row.story_id, {
          summary: row.summary,
          keyPoints: Array.isArray(row.key_points) ? (row.key_points as string[]) : [],
          whyItMatters: row.why_it_matters || "",
          opportunities: Array.isArray(row.opportunities) ? (row.opportunities as string[]) : [],
          risks: Array.isArray(row.risks) ? (row.risks as string[]) : [],
          model: row.model,
          tier: (row.tier as "normal" | "important") || "normal",
          generatedAt: row.generated_at,
        });
      }
    }
  } catch (intelErr) {
    console.warn("[Saved Stories Service] Non-fatal error fetching intelligence:", intelErr);
  }

  // 6. Build saved story items in bookmark order
  const savedStories: SavedStoryItem[] = [];
  for (const b of paginatedBookmarks) {
    const storyRow = storiesById.get(b.story_id);
    if (!storyRow) continue;

    const tags = categoriesByStory.get(storyRow.id) || [];
    const media = storyMediaMap.get(storyRow.id) || { imageUrl: null, sources: [] };
    const intel = intelligenceByStory.get(storyRow.id) || null;
    const impScore = storyRow.importance_score ? Number(storyRow.importance_score) : null;
    const importanceLevel = getImportanceLevel(impScore);
    const summaryText = intel?.summary || storyRow.summary;

    savedStories.push({
      id: storyRow.id,
      storyId: storyRow.id,
      bookmarkId: b.id,
      savedAt: b.created_at,
      title: storyRow.canonical_title,
      canonicalTitle: storyRow.canonical_title,
      summary: summaryText,
      imageUrl: media.imageUrl,
      firstPublishedAt: storyRow.first_published_at,
      latestPublishedAt: storyRow.latest_published_at,
      articleCount: storyRow.article_count,
      sourceCount: storyRow.source_count,
      importance: importanceLevel,
      importanceLevel,
      importanceScore: impScore,
      categories: tags,
      sources: media.sources,
      status: storyRow.status,
      relevance: {
        score: 1.0,
        isRelevant: true,
        matchedCategoryIds: tags.map((t) => t.categoryId),
        matchedCategoryNames: tags.map((t) => t.categoryName),
        synergyBoost: 0,
        recencyFactor: 1.0,
        explanation: "Saved in personal intelligence dossier",
      },
      feedScore: 1.0,
      intelligence: intel,
      isSaved: true,
    });
  }

  return {
    stories: savedStories,
    pagination: {
      limit,
      offset,
      count: totalCount,
      hasMore,
    },
  };
}
