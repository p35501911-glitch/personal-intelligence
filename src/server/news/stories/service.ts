import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, InsertStory, StoryRow } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import type { Story, StoryCandidate, StoryFetchOptions } from "./types";
import { categorizeAndTagStory, getCategorySlugToIdMap } from "../categories/service";
import { computeStoryImportance } from "../importance";

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

  // Fetch source details if available to factor in publisher tier
  let sourceDetails: Array<{ name?: string | null; url?: string | null }> = [];
  if (article.sourceId) {
    try {
      const { data: src } = await client
        .from("sources")
        .select("name, url")
        .eq("id", article.sourceId)
        .single();
      if (src) {
        sourceDetails = [{ name: src.name, url: src.url }];
      }
    } catch {
      // Non-fatal if sources query fails
    }
  }

  const importance = computeStoryImportance({
    canonicalTitle: article.title,
    summary: null,
    articleCount: 1,
    sourceCount: 1,
    firstPublishedAt: article.publishedAt,
    latestPublishedAt: article.publishedAt,
    sources: sourceDetails,
  });

  const newStoryRecord: InsertStory = {
    canonical_title: article.title.trim(),
    first_published_at: publishedIso,
    latest_published_at: publishedIso,
    article_count: 1,
    source_count: 1,
    importance_score: importance.score,
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
  const sourceIdsToQuery = new Set<string>();
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
      if (item.articles.source_id) {
        sourceIdsToQuery.add(item.articles.source_id);
      }
    }
  }

  // Also include the newly attached article in case join was pending
  const incomingPubTime = article.publishedAt.getTime();
  if (incomingPubTime < earliestTime) earliestTime = incomingPubTime;
  if (incomingPubTime > latestTime) latestTime = incomingPubTime;
  if (article.sourceId) {
    uniqueSourceKeys.add(article.sourceId);
    sourceIdsToQuery.add(article.sourceId);
  }

  const newArticleCount = Math.max(1, rawLinks.length);
  const newSourceCount = Math.max(1, uniqueSourceKeys.size);
  const bestTitle = chooseBestCanonicalTitle(storyRow.canonical_title, article.title);

  // Fetch sources for tier authority calculation
  let attachedSources: Array<{ name?: string | null; url?: string | null }> = [];
  if (sourceIdsToQuery.size > 0) {
    try {
      const { data: sourcesData } = await client
        .from("sources")
        .select("name, url")
        .in("id", Array.from(sourceIdsToQuery));
      if (sourcesData) {
        attachedSources = sourcesData;
      }
    } catch {
      // Non-fatal
    }
  }

  const importance = computeStoryImportance({
    canonicalTitle: bestTitle,
    summary: storyRow.summary,
    articleCount: newArticleCount,
    sourceCount: newSourceCount,
    firstPublishedAt: new Date(earliestTime),
    latestPublishedAt: new Date(latestTime),
    sources: attachedSources,
  });

  const { data: updatedStory, error: updateErr } = await client
    .from("stories")
    .update({
      canonical_title: bestTitle,
      first_published_at: new Date(earliestTime).toISOString(),
      latest_published_at: new Date(latestTime).toISOString(),
      article_count: newArticleCount,
      source_count: newSourceCount,
      importance_score: importance.score,
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
  const {
    limit = 20,
    offset = 0,
    status = "active",
    categoryId,
    sortBy = "recent",
    minImportance,
  } = options;

  let query = client
    .from("stories")
    .select("*", { count: "exact" });

  if (sortBy === "importance") {
    query = query
      .order("importance_score", { ascending: false, nullsFirst: false })
      .order("latest_published_at", { ascending: false });
  } else {
    query = query.order("latest_published_at", { ascending: false });
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (minImportance !== undefined && minImportance !== null) {
    query = query.gte("importance_score", minImportance);
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

export interface StoryArticleDetail {
  id: string;
  title: string;
  url: string;
  canonicalUrl: string | null;
  publishedAt: string;
  imageUrl: string | null;
  author: string | null;
  provider: string;
  publisher: string;
  publisherUrl: string | null;
}

export interface StoryCategoryDetail {
  id: string;
  name: string;
  slug: string;
  level: number;
  isPrimary: boolean;
  confidence: number;
}

export interface StoryIntelligenceDetail {
  summary: string;
  keyPoints: string[];
  whyItMatters: string;
  opportunities: string[];
  risks: string[];
  model: string;
  generatedAt: string;
}

export interface StoryDetails {
  id: string;
  title: string;
  canonicalTitle: string;
  summary: string | null;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  importanceScore: number | null;
  firstPublishedAt: string;
  latestPublishedAt: string;
  articleCount: number;
  sourceCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  categories: StoryCategoryDetail[];
  articles: StoryArticleDetail[];
  coverage: StoryArticleDetail[]; // alias for articles
  intelligence?: StoryIntelligenceDetail | null;
}

/**
 * Fetches full story details, including all attached publisher articles, original links,
 * and category tags.
 */
export async function getStoryDetails(
  storyId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<StoryDetails | null> {
  // 1. Fetch story
  const { data: storyRow, error: storyErr } = await client
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .maybeSingle();

  if (storyErr || !storyRow) {
    return null;
  }

  // 2. Fetch categories
  const { data: rawCategories } = await client
    .from("story_categories")
    .select(`
      category_id,
      confidence,
      is_primary,
      categories (
        id,
        name,
        slug,
        level
      )
    `)
    .eq("story_id", storyId);

  interface JoinedCatRow {
    category_id: string;
    confidence: number | string;
    is_primary: boolean;
    categories: {
      id: string;
      name: string;
      slug: string;
      level: number;
    } | { id: string; name: string; slug: string; level: number }[] | null;
  }

  const categoryDetails: StoryCategoryDetail[] = [];
  for (const r of ((rawCategories || []) as unknown as JoinedCatRow[])) {
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    if (cat) {
      categoryDetails.push({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        level: cat.level,
        isPrimary: r.is_primary,
        confidence: Number(r.confidence),
      });
    }
  }

  // 3. Fetch attached articles with publisher sources
  const { data: rawArticles } = await client
    .from("story_articles")
    .select(`
      article_id,
      articles (
        id,
        title,
        url,
        canonical_url,
        published_at,
        image_url,
        author,
        provider,
        source_id,
        sources (
          id,
          name,
          url
        )
      )
    `)
    .eq("story_id", storyId);

  interface JoinedArticleRow {
    article_id: string;
    articles: {
      id: string;
      title: string;
      url: string;
      canonical_url: string | null;
      published_at: string;
      image_url: string | null;
      author: string | null;
      provider: string;
      source_id: string | null;
      sources: {
        id: string;
        name: string;
        url: string | null;
      } | null;
    } | null;
  }

  const articleDetails: StoryArticleDetail[] = [];
  for (const r of ((rawArticles || []) as unknown as JoinedArticleRow[])) {
    if (r.articles) {
      const a = r.articles;
      const publisher = a.sources?.name || a.provider.toUpperCase();
      const publisherUrl = a.sources?.url || null;

      articleDetails.push({
        id: a.id,
        title: a.title,
        url: a.url,
        canonicalUrl: a.canonical_url,
        publishedAt: a.published_at,
        imageUrl: a.image_url,
        author: a.author,
        provider: a.provider,
        publisher,
        publisherUrl,
      });
    }
  }

  // Sort articles by publishedAt DESC
  articleDetails.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const impScore = storyRow.importance_score ? Number(storyRow.importance_score) : null;
  let importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (impScore !== null) {
    if (impScore >= 0.8) importance = "CRITICAL";
    else if (impScore >= 0.6) importance = "HIGH";
    else if (impScore >= 0.4) importance = "MEDIUM";
  }

  // 4. Fetch AI intelligence if available
  let intelligence: StoryIntelligenceDetail | null = null;
  try {
    const { data: intelRow } = await client
      .from("story_intelligence")
      .select("*")
      .eq("story_id", storyId)
      .maybeSingle();

    if (intelRow && intelRow.status === "completed") {
      intelligence = {
        summary: intelRow.summary,
        keyPoints: Array.isArray(intelRow.key_points) ? (intelRow.key_points as string[]) : [],
        whyItMatters: intelRow.why_it_matters,
        opportunities: Array.isArray(intelRow.opportunities) ? (intelRow.opportunities as string[]) : [],
        risks: Array.isArray(intelRow.risks) ? (intelRow.risks as string[]) : [],
        model: intelRow.model,
        generatedAt: intelRow.generated_at,
      };
    }
  } catch {
    // Non-fatal if story_intelligence table is pending migration
  }

  return {
    id: storyRow.id,
    title: storyRow.canonical_title,
    canonicalTitle: storyRow.canonical_title,
    summary: storyRow.summary,
    importance,
    importanceScore: impScore,
    firstPublishedAt: storyRow.first_published_at,
    latestPublishedAt: storyRow.latest_published_at,
    articleCount: Math.max(storyRow.article_count, articleDetails.length),
    sourceCount: storyRow.source_count,
    status: storyRow.status,
    createdAt: storyRow.created_at,
    updatedAt: storyRow.updated_at,
    categories: categoryDetails,
    articles: articleDetails,
    coverage: articleDetails,
    intelligence,
  };
}
