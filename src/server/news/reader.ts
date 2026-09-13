import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../supabase";
import { getCategorySlugToIdMap } from "./categories/service";

export interface ApiArticle {
  id: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceUrl: string | null;
  publishedAt: string;
  fetchedAt: string;
  language: string | null;
  provider: string;
}

export interface FetchArticlesOptions {
  limit?: number;
  offset?: number;
  provider?: string;
  categoryId?: string;
  client?: SupabaseClient<Database>;
}

export interface FetchArticlesResult {
  articles: ApiArticle[];
  limit: number;
  count: number;
  offset: number;
}

interface JoinedSource {
  id?: string;
  name?: string | null;
  url?: string | null;
}

interface ArticleWithSourceRow {
  id: string;
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  published_at: string;
  fetched_at: string;
  language: string | null;
  provider: string;
  sources: JoinedSource | JoinedSource[] | null;
}

/**
 * Reads persisted articles from Supabase PostgreSQL.
 *
 * - Joins `sources` table for source name and URL.
 * - Sorts by `published_at DESC`.
 * - Supports provider filtering and limit/offset pagination.
 * - Handles optional categoryId filtering gracefully.
 * - Never calls external providers on read requests.
 */
export async function getPersistedArticles(
  options: FetchArticlesOptions = {}
): Promise<FetchArticlesResult> {
  const {
    limit = 20,
    offset = 0,
    provider,
    categoryId,
    client = getServiceSupabaseClient(),
  } = options;

  let query = client
    .from("articles")
    .select(`
      id,
      title,
      description,
      url,
      image_url,
      published_at,
      fetched_at,
      language,
      provider,
      sources (
        id,
        name,
        url
      )
    `)
    .order("published_at", { ascending: false });

  if (provider) {
    query = query.eq("provider", provider.toLowerCase().trim());
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
              data: { article_id: string }[] | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };

      // Query relation table if it exists
      const { data: categoryLinks, error: catErr } = await (
        client as unknown as RelationClient
      )
        .from("article_categories")
        .select("article_id")
        .eq("category_id", targetCategoryId);

      if (catErr || !categoryLinks || categoryLinks.length === 0) {
        // Table doesn't exist yet or no matching articles
        return {
          articles: [],
          limit,
          count: 0,
          offset,
        };
      }

      const articleIds = categoryLinks.map((link: { article_id: string }) => link.article_id);
      query = query.in("id", articleIds);
    } catch {
      return {
        articles: [],
        limit,
        count: 0,
        offset,
      };
    }
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    const sanitizedMsg = `Database error reading articles: ${error.message} (code: ${error.code})`;
    console.error("[Reader]", sanitizedMsg);
    throw new Error(sanitizedMsg);
  }

  const rawRows = (data || []) as unknown as ArticleWithSourceRow[];

  const articles: ApiArticle[] = rawRows.map((row) => {
    const sourceObj = (
      Array.isArray(row.sources) ? row.sources[0] : row.sources
    ) as JoinedSource | null | undefined;

    const sourceName = sourceObj?.name?.trim() || row.provider || "Unknown";
    const sourceUrl = sourceObj?.url?.trim() || null;

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      url: row.url,
      imageUrl: row.image_url,
      source: sourceName,
      sourceUrl: sourceUrl,
      publishedAt: new Date(row.published_at).toISOString(),
      fetchedAt: new Date(row.fetched_at).toISOString(),
      language: row.language,
      provider: row.provider,
    };
  });

  return {
    articles,
    limit,
    count: articles.length,
    offset,
  };
}
