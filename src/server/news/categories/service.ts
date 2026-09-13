import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import { matchCategories, type CategoryMatch } from "./matcher";

// Cache mapping slug -> database UUID id
let slugToIdCache: Map<string, string> | null = null;

/**
 * Resolves the database ID for categories by their unique slug.
 * Supports both UUID IDs in PostgreSQL and fallback IDs in test environments.
 */
export async function getCategorySlugToIdMap(
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<Map<string, string>> {
  if (slugToIdCache && slugToIdCache.size > 0) {
    return slugToIdCache;
  }

  try {
    const { data, error } = await client
      .from("categories")
      .select("id, slug");

    if (!error && data && data.length > 0) {
      slugToIdCache = new Map<string, string>();
      for (const row of data) {
        slugToIdCache.set(row.slug, row.id);
      }
      return slugToIdCache;
    }
  } catch {
    // If table not present yet or mock doesn't support, continue
  }

  return new Map<string, string>();
}

/**
 * Resets the in-memory slug to ID cache (useful in tests).
 */
export function resetCategoryCache(): void {
  slugToIdCache = null;
}

/**
 * Tags an article with its matched categories in article_categories junction table.
 */
export async function tagArticleWithCategories(
  articleId: string,
  matches: CategoryMatch[],
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<void> {
  if (matches.length === 0) return;

  const slugMap = await getCategorySlugToIdMap(client);

  const records = matches.map((m) => {
    // Use resolved database UUID if available, otherwise use categoryId
    const resolvedId = slugMap.get(m.categorySlug) || m.categoryId;
    return {
      article_id: articleId,
      category_id: resolvedId,
      confidence: m.confidence,
      is_primary: m.isPrimary,
    };
  });

  try {
    const { error } = await client
      .from("article_categories")
      .upsert(records, { onConflict: "article_id,category_id", ignoreDuplicates: false });

    if (error) {
      console.warn(`[Categories] Notice tagging article ${articleId}:`, error.message);
    }
  } catch (err) {
    console.warn(`[Categories] Non-fatal exception tagging article ${articleId}:`, err);
  }
}

/**
 * Tags a story with its matched categories in story_categories junction table.
 */
export async function tagStoryWithCategories(
  storyId: string,
  matches: CategoryMatch[],
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<void> {
  if (matches.length === 0) return;

  const slugMap = await getCategorySlugToIdMap(client);

  const records = matches.map((m) => {
    const resolvedId = slugMap.get(m.categorySlug) || m.categoryId;
    return {
      story_id: storyId,
      category_id: resolvedId,
      confidence: m.confidence,
      is_primary: m.isPrimary,
    };
  });

  try {
    const { error } = await client
      .from("story_categories")
      .upsert(records, { onConflict: "story_id,category_id", ignoreDuplicates: false });

    if (error) {
      console.warn(`[Categories] Notice tagging story ${storyId}:`, error.message);
    }
  } catch (err) {
    console.warn(`[Categories] Non-fatal exception tagging story ${storyId}:`, err);
  }
}

/**
 * Convenience function: Runs category matching and immediately tags an article.
 */
export async function categorizeAndTagArticle(
  article: {
    id: string;
    title: string;
    description?: string | null;
    content?: string | null;
  },
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<CategoryMatch[]> {
  const matches = matchCategories({
    title: article.title,
    description: article.description,
    content: article.content,
  });

  if (matches.length > 0) {
    await tagArticleWithCategories(article.id, matches, client);
  }

  return matches;
}

/**
 * Convenience function: Runs category matching and immediately tags a story.
 */
export async function categorizeAndTagStory(
  story: {
    id: string;
    canonicalTitle: string;
    summary?: string | null;
  },
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<CategoryMatch[]> {
  const matches = matchCategories({
    title: story.canonicalTitle,
    description: story.summary,
  });

  if (matches.length > 0) {
    await tagStoryWithCategories(story.id, matches, client);
  }

  return matches;
}

/**
 * Retrieves the categories associated with an article.
 */
export async function getCategoriesForArticle(
  articleId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<Array<{ categoryId: string; confidence: number; isPrimary: boolean }>> {
  const { data, error } = await client
    .from("article_categories")
    .select("category_id, confidence, is_primary")
    .eq("article_id", articleId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    categoryId: row.category_id,
    confidence: Number(row.confidence),
    isPrimary: row.is_primary,
  }));
}

/**
 * Retrieves the categories associated with a story.
 */
export async function getCategoriesForStory(
  storyId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<Array<{ categoryId: string; confidence: number; isPrimary: boolean }>> {
  const { data, error } = await client
    .from("story_categories")
    .select("category_id, confidence, is_primary")
    .eq("story_id", storyId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    categoryId: row.category_id,
    confidence: Number(row.confidence),
    isPrimary: row.is_primary,
  }));
}
