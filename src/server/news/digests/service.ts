import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import type {
  TopicDigest,
  DigestStory,
  DigestPeriodType,
  DigestFetchOptions,
  DigestListResult,
  KeyDevelopmentItem,
  CategoryHighlightItem,
} from "./types";
import type { PersonalizedStoryItem } from "../relevance";

interface RawDigestRow {
  id: string;
  user_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  title: string;
  executive_summary: string;
  key_developments: unknown;
  category_highlights: unknown;
  opportunities: unknown;
  risks: unknown;
  story_count: number;
  important_story_count: number;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
}

interface RawDigestStoryRow {
  id: string;
  digest_id: string;
  story_id: string;
  rank: number;
  importance_score: number | string | null;
  is_important: boolean;
}

interface RawStoryRow {
  id: string;
  canonical_title: string;
  summary: string | null;
  first_published_at: string;
  latest_published_at: string;
  article_count: number;
  source_count: number;
  importance_score: number | string | null;
  status: string;
}

function mapRowToTopicDigest(row: RawDigestRow, stories?: DigestStory[]): TopicDigest {
  return {
    id: row.id,
    userId: row.user_id,
    periodType: (row.period_type as DigestPeriodType) || "daily",
    periodStart: row.period_start,
    periodEnd: row.period_end,
    title: row.title,
    executiveSummary: row.executive_summary,
    keyDevelopments: Array.isArray(row.key_developments) ? (row.key_developments as KeyDevelopmentItem[]) : [],
    categoryHighlights: Array.isArray(row.category_highlights) ? (row.category_highlights as CategoryHighlightItem[]) : [],
    opportunities: Array.isArray(row.opportunities) ? (row.opportunities as string[]) : [],
    risks: Array.isArray(row.risks) ? (row.risks as string[]) : [],
    storyCount: Number(row.story_count) || 0,
    importantStoryCount: Number(row.important_story_count) || 0,
    model: row.model,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    stories,
  };
}

/**
 * Retrieves a specific digest for an exact user and period, if already generated.
 */
export async function getDigestForPeriod(
  userId: string,
  periodType: DigestPeriodType,
  periodStart: string,
  periodEnd: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<TopicDigest | null> {
  if (!userId) return null;

  try {
    const { data, error } = await client
      .from("topic_digests")
      .select("*")
      .eq("user_id", userId)
      .eq("period_type", periodType)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();

    if (error || !data) return null;

    const digest = mapRowToTopicDigest(data as RawDigestRow);
    const stories = await getDigestStories(digest.id, client);
    digest.stories = stories;
    return digest;
  } catch (err) {
    console.warn("[Digest Service] Notice in getDigestForPeriod:", err);
    return null;
  }
}

/**
 * Retrieves the latest generated digest for a user, optionally filtered by periodType.
 */
export async function getLatestDigest(
  userId: string,
  periodType?: DigestPeriodType,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<TopicDigest | null> {
  if (!userId) return null;

  try {
    let query = client
      .from("topic_digests")
      .select("*")
      .eq("user_id", userId);

    if (periodType) {
      query = query.eq("period_type", periodType);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const digest = mapRowToTopicDigest(data as RawDigestRow);
    const stories = await getDigestStories(digest.id, client);
    digest.stories = stories;
    return digest;
  } catch (err) {
    console.warn("[Digest Service] Notice in getLatestDigest:", err);
    return null;
  }
}

/**
 * Retrieves a paginated list of digests for an authenticated user.
 */
export async function getUserDigests(
  userId: string,
  options: DigestFetchOptions = {},
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<DigestListResult> {
  const { periodType, limit = 10, offset = 0 } = options;

  if (!userId) {
    return {
      digests: [],
      pagination: { limit, offset, count: 0, hasMore: false },
    };
  }

  try {
    let query = client
      .from("topic_digests")
      .select("*")
      .eq("user_id", userId);

    if (periodType) {
      query = query.eq("period_type", periodType);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      return {
        digests: [],
        pagination: { limit, offset, count: 0, hasMore: false },
      };
    }

    const totalCount = data.length;
    const paginatedRows = (data as RawDigestRow[]).slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    const digests = paginatedRows.map((row) => mapRowToTopicDigest(row));

    return {
      digests,
      pagination: {
        limit,
        offset,
        count: totalCount,
        hasMore,
      },
    };
  } catch (err) {
    console.warn("[Digest Service] Notice in getUserDigests:", err);
    return {
      digests: [],
      pagination: { limit, offset, count: 0, hasMore: false },
    };
  }
}

/**
 * Retrieves a single digest by ID with full included stories.
 */
export async function getDigestById(
  digestId: string,
  userId?: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<TopicDigest | null> {
  if (!digestId) return null;

  try {
    let query = client.from("topic_digests").select("*").eq("id", digestId);
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;

    const digest = mapRowToTopicDigest(data as RawDigestRow);
    digest.stories = await getDigestStories(digest.id, client);
    return digest;
  } catch (err) {
    console.warn("[Digest Service] Notice in getDigestById:", err);
    return null;
  }
}

/**
 * Helper to fetch and join ranked stories for a digest.
 */
export async function getDigestStories(
  digestId: string,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<DigestStory[]> {
  try {
    const { data, error } = await client
      .from("topic_digest_stories")
      .select("id, digest_id, story_id, rank, importance_score, is_important")
      .eq("digest_id", digestId)
      .order("rank", { ascending: true });

    if (error || !data || data.length === 0) return [];

    const storyRows = data as RawDigestStoryRow[];
    const storyIds = storyRows.map((r) => r.story_id);

    // Fetch story summaries and intelligence
    const { data: rawStories } = await client
      .from("stories")
      .select("id, canonical_title, summary, first_published_at, latest_published_at, article_count, source_count, importance_score, status")
      .in("id", storyIds);

    const storyMap = new Map<string, RawStoryRow>();
    for (const s of (rawStories || []) as unknown as RawStoryRow[]) {
      storyMap.set(s.id, s);
    }

    // Fetch intelligence
    const { data: rawIntel } = await client
      .from("story_intelligence")
      .select("story_id, summary, key_points, why_it_matters, opportunities, risks, model, tier, status, generated_at")
      .in("story_id", storyIds)
      .eq("status", "completed");

    const intelMap = new Map<string, unknown>();
    for (const i of rawIntel || []) {
      intelMap.set(i.story_id, i);
    }

    return storyRows.map((r) => {
      const s = storyMap.get(r.story_id);
      const intel = intelMap.get(r.story_id) as {
        summary: string;
        key_points: string[];
        why_it_matters?: string;
        opportunities?: string[];
        risks?: string[];
        model: string;
        tier?: string;
        generated_at: string;
      } | undefined;

      const fullStoryItem: PersonalizedStoryItem | null = s
        ? {
            id: s.id,
            title: s.canonical_title,
            canonicalTitle: s.canonical_title,
            summary: intel?.summary || s.summary,
            imageUrl: null,
            firstPublishedAt: s.first_published_at,
            latestPublishedAt: s.latest_published_at,
            articleCount: s.article_count,
            sourceCount: s.source_count,
            importance: Number(s.importance_score) >= 0.7 ? "CRITICAL" : "LOW",
            importanceScore: s.importance_score ? Number(s.importance_score) : null,
            categories: [],
            sources: [],
            status: s.status,
            relevance: {
              score: 1.0,
              isRelevant: true,
              matchedCategoryIds: [],
              matchedCategoryNames: [],
              synergyBoost: 0,
              recencyFactor: 1.0,
              explanation: "Included in intelligence briefing",
            },
            feedScore: 1.0,
            intelligence: intel
              ? {
                  summary: intel.summary,
                  keyPoints: Array.isArray(intel.key_points) ? intel.key_points : [],
                  whyItMatters: intel.why_it_matters || "",
                  opportunities: Array.isArray(intel.opportunities) ? intel.opportunities : [],
                  risks: Array.isArray(intel.risks) ? intel.risks : [],
                  model: intel.model,
                  tier: (intel.tier as "normal" | "important") || "normal",
                  generatedAt: intel.generated_at,
                }
              : null,
          }
        : null;

      return {
        id: r.id,
        digestId: r.digest_id,
        storyId: r.story_id,
        rank: r.rank,
        importanceScore: r.importance_score !== null ? Number(r.importance_score) : null,
        isImportant: r.is_important,
        story: fullStoryItem,
      };
    });
  } catch (err) {
    console.warn("[Digest Service] Notice in getDigestStories:", err);
    return [];
  }
}

/**
 * Persists a generated digest and its ranked story associations atomically.
 */
export async function saveDigest(
  digestData: {
    userId: string;
    periodType: DigestPeriodType;
    periodStart: string;
    periodEnd: string;
    title: string;
    executiveSummary: string;
    keyDevelopments: KeyDevelopmentItem[];
    categoryHighlights: CategoryHighlightItem[];
    opportunities: string[];
    risks: string[];
    storyCount: number;
    importantStoryCount: number;
    model: string | null;
    promptVersion: string | null;
  },
  storyItems: Array<{
    storyId: string;
    rank: number;
    importanceScore: number | null;
    isImportant: boolean;
  }>,
  client: SupabaseClient<Database> = getServiceSupabaseClient()
): Promise<TopicDigest> {
  // 1. Upsert topic_digests
  const { data: digestRow, error: digestErr } = await client
    .from("topic_digests")
    .upsert(
      {
        user_id: digestData.userId,
        period_type: digestData.periodType,
        period_start: digestData.periodStart,
        period_end: digestData.periodEnd,
        title: digestData.title,
        executive_summary: digestData.executiveSummary,
        key_developments: digestData.keyDevelopments,
        category_highlights: digestData.categoryHighlights,
        opportunities: digestData.opportunities,
        risks: digestData.risks,
        story_count: digestData.storyCount,
        important_story_count: digestData.importantStoryCount,
        model: digestData.model,
        prompt_version: digestData.promptVersion,
      },
      { onConflict: "user_id,period_type,period_start,period_end" }
    )
    .select("*")
    .single();

  if (digestErr || !digestRow) {
    throw new Error(`Failed to persist topic_digest: ${digestErr?.message || "Unknown error"}`);
  }

  const savedDigest = mapRowToTopicDigest(digestRow as RawDigestRow);

  // 2. Insert ranked topic_digest_stories
  if (storyItems.length > 0) {
    const storiesToInsert = storyItems.map((s) => ({
      digest_id: savedDigest.id,
      story_id: s.storyId,
      rank: s.rank,
      importance_score: s.importanceScore,
      is_important: s.isImportant,
    }));

    const { error: storiesErr } = await client
      .from("topic_digest_stories")
      .upsert(storiesToInsert, { onConflict: "digest_id,story_id" });

    if (storiesErr) {
      console.warn("[Digest Service] Non-fatal error persisting digest stories:", storiesErr.message);
    }
  }

  savedDigest.stories = await getDigestStories(savedDigest.id, client);
  return savedDigest;
}
