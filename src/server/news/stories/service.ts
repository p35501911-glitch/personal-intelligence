import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, InsertStory, StoryRow } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import type { Story, StoryCandidate, StoryFetchOptions } from "./types";
import { categorizeAndTagStory, getCategorySlugToIdMap } from "../categories/service";

/**
 * Selects the best canonical title deterministically between an existing title
 * and a newly attached article's title.
 *
 * Rules:
 * - Avoids all-caps headlines.
 * - Prefers standard length (40 - 110 chars).
 * - Defaults to preserving the established canonical title when equally good.
 */
export function chooseBestCanonicalTitle(currentTitle: string, newTitle: string): string {
  if (!newTitle || newTitle.trim().length === 0) return currentTitle;
  if (!currentTitle || currentTitle.trim().length === 0) return newTitle.trim();

  const isCurrentAllCaps = currentTitle === currentTitle.toUpperCase() && currentTitle.length > 10;
  const isNewAllCaps = newTitle === newTitle.toUpperCase() && newTitle.length > 10;

  if (isCurrentAllCaps && !isNewAllCaps) {
    return newTitle.trim();
  }

  // Otherwise, deterministically keep the established canonical title
  return currentTitle.trim();
}

/**
 * Creates a new story record and links the initial article.
 */
export async function createStory(
  article: {
    id: string;
    title: string;
    publishedAt: Date;
    sourceId?: string | null;
  },
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<Story> {
  const publishedIso = article.publishedAt.toISOString();

  const newStoryRecord: InsertStory = {
    canonical_title: article.title.trim(),
    first_published_at: publishedIso,
    latest_published_at: publishedIso,
    article_count: 1,
    source_count: 1,
    status: "active",
  };

  const { data: storyData, error: storyErr } = await client
    .from("stories")
    .insert(newStoryRecord)
    .select("*")
    .single();

  if (storyErr || !storyData) {
    throw new Error(`Failed to create story: ${storyErr?.message || "Unknown error"}`);
  }

  const storyRow = storyData as StoryRow;

  // Link article to story in junction table
  const { error: linkErr } = await client
    .from("story_articles")
    .insert({
      story_id: storyRow.id,
      article_id: article.id,
    });

  if (linkErr) {
    console.error(`[Stories] Error linking article ${article.id} to story ${storyRow.id}:`, linkErr);
  }

  // Tag story with categories deterministically
  try {
    await categorizeAndTagStory(
      {
        id: storyRow.id,
        canonicalTitle: storyRow.canonical_title,
        summary: storyRow.summary,
      },
      client
    );
  } catch (catErr) {
    console.warn(`[Stories] Non-fatal error categorizing story ${storyRow.id}:`, catErr);
  }

  return {
    id: storyRow.id,
    canonicalTitle: storyRow.canonical_title,
    summary: storyRow.summary,
    firstPublishedAt: new Date(storyRow.first_published_at),
    latestPublishedAt: new Date(storyRow.latest_published_at),
    articleCount: storyRow.article_count,
    sourceCount: storyRow.source_count,
    importanceScore: storyRow.importance_score ? Number(storyRow.importance_score) : null,
    status: storyRow.status,
    createdAt: new Date(storyRow.created_at),
    updatedAt: new Date(storyRow.updated_at),
  };
}

/**
 * Attaches an article to an existing story.
 *
 * Updates:
 * - story_articles junction table (idempotent, prevents duplicate links)
 * - first_published_at = min(first_published_at, article.publishedAt)
 * - latest_published_at = max(latest_published_at, article.publishedAt)
 * - article_count = total count of unique attached articles
 * - source_count = total count of unique publishers covering this story
 */
export async function attachArticleToStory(
  storyId: string,
  article: {
    id: string;
    title: string;
    publishedAt: Date;
    sourceId?: string | null;
  },
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<Story> {
  // 1. Insert into junction table (on conflict do nothing)
  const { error: linkErr } = await client
    .from("story_articles")
    .upsert(
      {
        story_id: storyId,
        article_id: article.id,
      },
      { onConflict: "story_id,article_id", ignoreDuplicates: true }
    );

  if (linkErr) {
    console.error(`[Stories] Failed to link article ${article.id} to story ${storyId}:`, linkErr);
  }

  // 2. Fetch current story to update metadata
  const { data: currentStory, error: getErr } = await client
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .single();

  if (getErr || !currentStory) {
    throw new Error(`Story ${storyId} not found: ${getErr?.message || "Unknown error"}`);
  }

  const storyRow = currentStory as StoryRow;

  // 3. Query all attached articles to compute exact timing and unique sources
  const { data: linkedArticles } = await client
    .from("story_articles")
    .select(`
      article_id,
      articles (
        id,
        source_id,
        published_at,
        provider
      )
    `)
    .eq("story_id", storyId);

  const rawLinks = (linkedArticles || []) as unknown as Array<{
    article_id: string;
    articles: {
      id: string;
      source_id: string | null;
      published_at: string;
      provider: string;
    } | null;
  }>;

  // Calculate unique sources & timing
  const uniqueSourceKeys = new Set<string>();
  let earliestTime = new Date(storyRow.first_published_at).getTime();
  let latestTime = new Date(storyRow.latest_published_at).getTime();

  for (const item of rawLinks) {
    if (item.articles) {
      const pubTime = new Date(item.articles.published_at).getTime();
      if (!isNaN(pubTime)) {
        if (pubTime < earliestTime) earliestTime = pubTime;
        if (pubTime > latestTime) latestTime = pubTime;
      }

      // Unique source identifier: source_id or fallback to provider
      const sourceKey = item.articles.source_id || `provider:${item.articles.provider}`;
      uniqueSourceKeys.add(sourceKey);
    }
  }

  // Also include the newly attached article in case join was pending
  const incomingPubTime = article.publishedAt.getTime();
  if (incomingPubTime < earliestTime) earliestTime = incomingPubTime;
  if (incomingPubTime > latestTime) latestTime = incomingPubTime;
  if (article.sourceId) {
    uniqueSourceKeys.add(article.sourceId);
  }

  const newArticleCount = Math.max(1, rawLinks.length);
  const newSourceCount = Math.max(1, uniqueSourceKeys.size);
  const bestTitle = chooseBestCanonicalTitle(storyRow.canonical_title, article.title);

  const { data: updatedStory, error: updateErr } = await client
    .from("stories")
    .update({
      canonical_title: bestTitle,
      first_published_at: new Date(earliestTime).toISOString(),
      latest_published_at: new Date(latestTime).toISOString(),
      article_count: newArticleCount,
      source_count: newSourceCount,
    })
    .eq("id", storyId)
    .select("*")
    .single();

  if (updateErr || !updatedStory) {
    throw new Error(`Failed to update story ${storyId}: ${updateErr?.message || "Unknown error"}`);
  }

  const updatedRow = updatedStory as StoryRow;

  // Retag or ensure story categories are synchronized
  try {
    await categorizeAndTagStory(
      {
        id: storyId,
        canonicalTitle: bestTitle,
        summary: updatedRow.summary,
      },
      client
    );
  } catch (catErr) {
    console.warn(`[Stories] Non-fatal error categorizing story ${storyId}:`, catErr);
  }

  return {
    id: updatedRow.id,
    canonicalTitle: updatedRow.canonical_title,
    summary: updatedRow.summary,
    firstPublishedAt: new Date(updatedRow.first_published_at),
    latestPublishedAt: new Date(updatedRow.latest_published_at),
    articleCount: updatedRow.article_count,
    sourceCount: updatedRow.source_count,
    importanceScore: updatedRow.importance_score ? Number(updatedRow.importance_score) : null,
    status: updatedRow.status,
    createdAt: new Date(updatedRow.created_at),
    updatedAt: new Date(updatedRow.updated_at),
  };
}

/**
 * Retrieves active candidate stories within a publication time window (default 72 hours).
 */
export async function getActiveStoryCandidates(
  referenceTime: Date,
  windowHours: number = 72,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<StoryCandidate[]> {
  const windowStart = new Date(referenceTime.getTime() - windowHours * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(referenceTime.getTime() + windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("stories")
    .select("id, canonical_title, first_published_at, latest_published_at, article_count, source_count")
    .eq("status", "active")
    .gte("latest_published_at", windowStart)
    .lte("first_published_at", windowEnd)
    .order("latest_published_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    canonicalTitle: row.canonical_title,
    firstPublishedAt: new Date(row.first_published_at),
    latestPublishedAt: new Date(row.latest_published_at),
    articleCount: row.article_count,
    sourceCount: row.source_count,
  }));
}

/**
 * Queries stories with pagination for the stories read API.
 */
export async function getStories(
  options: StoryFetchOptions = {},
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<{ stories: Story[]; count: number; limit: number; offset: number }> {
  const { limit = 20, offset = 0, status = "active", categoryId } = options;

  let query = client
    .from("stories")
    .select("*", { count: "exact" })
    .order("latest_published_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  // Handle category filtering
  if (categoryId) {
    try {
      const slugMap = await getCategorySlugToIdMap(client);
      const targetCategoryId = slugMap.get(categoryId) || categoryId;

      type RelationClient = {
        from(table: string): {
          select(columns: string): {
            eq(column: string, value: string): Promise<{
              data: { story_id: string }[] | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };

      const { data: categoryLinks, error: catErr } = await (
        client as unknown as RelationClient
      )
        .from("story_categories")
        .select("story_id")
        .eq("category_id", targetCategoryId);

      if (catErr || !categoryLinks || categoryLinks.length === 0) {
        return {
          stories: [],
          limit,
          count: 0,
          offset,
        };
      }

      const storyIds = categoryLinks.map((link: { story_id: string }) => link.story_id);
      query = query.in("id", storyIds);
    } catch {
      return {
        stories: [],
        limit,
        count: 0,
        offset,
      };
    }
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Database error fetching stories: ${error.message} (code: ${error.code})`);
  }

  const stories: Story[] = ((data || []) as StoryRow[]).map((row) => ({
    id: row.id,
    canonicalTitle: row.canonical_title,
    summary: row.summary,
    firstPublishedAt: new Date(row.first_published_at),
    latestPublishedAt: new Date(row.latest_published_at),
    articleCount: row.article_count,
    sourceCount: row.source_count,
    importanceScore: row.importance_score ? Number(row.importance_score) : null,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));

  return {
    stories,
    count: count ?? stories.length,
    limit,
    offset,
  };
}
