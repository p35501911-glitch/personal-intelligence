import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../supabase";
import { getGeminiConfig, isGeminiConfigured } from "./client";
import { CURRENT_AI_PROMPT_VERSION } from "./prompts";
import { generateStoryIntelligence } from "./service";
import type { StoryInputForAI } from "./types";
import type { GoogleGenAI } from "@google/genai";

export interface AIPipelineStats {
  totalEligible: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  rateLimited: boolean;
  durationMs: number;
  errors: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ArticleJoinRow {
  article_id: string;
  articles: {
    id: string;
    title: string;
    description: string | null;
    content: string | null;
    provider: string;
    sources: { name: string; url: string | null } | null;
  } | null;
}

interface CategoryJoinRow {
  is_primary: boolean;
  categories: { name: string } | null;
}

/**
 * Executes AI intelligence processing for stories that need analysis.
 *
 * Designed for Free-Tier Gemini:
 * - Shared story-level analysis: 1 story analyzed once, shared by all users.
 * - Respects free rate limits: 2-second delay between requests, batch limits.
 * - Idempotent caching: skips stories already analyzed with current prompt/model version.
 * - Fault tolerant: failures never crash caller or news ingestion.
 */
export async function processPendingStoryIntelligence(options?: {
  supabaseClient?: SupabaseClient<Database>;
  geminiClient?: GoogleGenAI | null;
  limit?: number;
  forceRegenerate?: boolean;
}): Promise<AIPipelineStats> {
  const startTime = Date.now();
  const config = getGeminiConfig();
  const client = options?.supabaseClient ?? getServiceSupabaseClient();
  const limit = options?.limit ?? config.batchSize;
  const forceRegenerate = options?.forceRegenerate ?? false;

  const stats: AIPipelineStats = {
    totalEligible: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    rateLimited: false,
    durationMs: 0,
    errors: [],
  };

  // Check if Gemini is configured
  if (!isGeminiConfigured() && !options?.geminiClient) {
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  try {
    // 1. Fetch active stories ordered by importance and recency
    const { data: storiesData, error: storiesErr } = await client
      .from("stories")
      .select("id, canonical_title, summary, first_published_at, latest_published_at, article_count, source_count, importance_score")
      .eq("status", "active")
      .order("importance_score", { ascending: false, nullsFirst: false })
      .order("latest_published_at", { ascending: false })
      .limit(limit * 3); // Query slightly wider pool to filter already-processed

    if (storiesErr || !storiesData || storiesData.length === 0) {
      if (storiesErr) stats.errors.push(`Stories fetch error: ${storiesErr.message}`);
      stats.durationMs = Date.now() - startTime;
      return stats;
    }

    // 2. Fetch existing intelligence records to identify already-analyzed stories
    const storyIds = storiesData.map((s) => s.id);
    const { data: existingIntel, error: intelErr } = await client
      .from("story_intelligence")
      .select("story_id, model, prompt_version, status, attempts, updated_at")
      .in("story_id", storyIds);

    if (intelErr) {
      // Table might not exist yet (pending migration)
      console.warn(`[Gemini Pipeline] story_intelligence table check notice: ${intelErr.message}`);
      stats.errors.push(`Table check notice: ${intelErr.message}`);
      stats.durationMs = Date.now() - startTime;
      return stats;
    }

    const intelMap = new Map<string, {
      model: string;
      promptVersion: number;
      status: string;
      attempts: number;
    }>();

    for (const row of existingIntel || []) {
      intelMap.set(row.story_id, {
        model: row.model,
        promptVersion: row.prompt_version,
        status: row.status,
        attempts: row.attempts,
      });
    }

    // 3. Filter eligible stories
    const eligibleStories = storiesData.filter((story) => {
      if (forceRegenerate) return true;
      const existing = intelMap.get(story.id);
      if (!existing) return true; // No record exists

      // Re-run if model or prompt version changed
      if (existing.promptVersion < CURRENT_AI_PROMPT_VERSION || existing.model !== config.model) {
        return true;
      }

      // If previously completed, skip (cache hit!)
      if (existing.status === "completed") {
        return false;
      }

      // If failed but under max attempts, allow retry
      if (existing.status === "failed" && existing.attempts < 3) {
        return true;
      }

      return false;
    }).slice(0, limit);

    stats.totalEligible = eligibleStories.length;

    if (eligibleStories.length === 0) {
      stats.durationMs = Date.now() - startTime;
      return stats;
    }

    // 4. Process each eligible story
    for (let i = 0; i < eligibleStories.length; i++) {
      const story = eligibleStories[i];
      stats.processed++;

      // Inter-request rate limit spacing (2 seconds delay between requests)
      if (i > 0) {
        await sleep(2000);
      }

      // Fetch attached articles and categories for rich context
      let articlesPreview: StoryInputForAI["articlesPreview"] = [];
      let categories: StoryInputForAI["categories"] = [];
      let sources: StoryInputForAI["sources"] = [];

      try {
        const { data: artRows } = await client
          .from("story_articles")
          .select(`
            article_id,
            articles (
              id,
              title,
              description,
              content,
              provider,
              sources ( name, url )
            )
          `)
          .eq("story_id", story.id)
          .limit(3);

        if (artRows) {
          const typedArtRows = artRows as unknown as ArticleJoinRow[];
          articlesPreview = typedArtRows
            .filter((r) => r.articles !== null)
            .map((r) => ({
              title: r.articles!.title,
              publisher: r.articles!.sources?.name || r.articles!.provider,
              description: r.articles!.description,
              content: r.articles!.content,
            }));

          const srcMap = new Map<string, { name: string; url?: string | null }>();
          for (const r of typedArtRows) {
            if (r.articles?.sources?.name) {
              srcMap.set(r.articles.sources.name, {
                name: r.articles.sources.name,
                url: r.articles.sources.url,
              });
            }
          }
          sources = Array.from(srcMap.values());
        }
      } catch {
        // Non-fatal
      }

      try {
        const { data: catRows } = await client
          .from("story_categories")
          .select(`
            is_primary,
            categories ( name )
          `)
          .eq("story_id", story.id);

        if (catRows) {
          const typedCatRows = catRows as unknown as CategoryJoinRow[];
          categories = typedCatRows
            .filter((r) => r.categories !== null)
            .map((r) => ({
              categoryName: r.categories!.name,
              isPrimary: r.is_primary,
            }));
        }
      } catch {
        // Non-fatal
      }

      const inputForAI: StoryInputForAI = {
        id: story.id,
        canonicalTitle: story.canonical_title,
        summary: story.summary,
        firstPublishedAt: story.first_published_at,
        latestPublishedAt: story.latest_published_at,
        articleCount: story.article_count,
        sourceCount: story.source_count,
        sources,
        categories,
        articlesPreview,
      };

      // Generate Intelligence via Gemini
      const genResult = await generateStoryIntelligence(inputForAI, {
        client: options?.geminiClient,
      });

      const existingRecord = intelMap.get(story.id);
      const attempts = (existingRecord?.attempts || 0) + 1;

      if (genResult.success && genResult.data) {
        // Persistence: Upsert into story_intelligence
        const { error: upsertErr } = await client
          .from("story_intelligence")
          .upsert(
            {
              story_id: story.id,
              model: genResult.model,
              prompt_version: CURRENT_AI_PROMPT_VERSION,
              summary: genResult.data.summary,
              key_points: genResult.data.keyPoints,
              why_it_matters: genResult.data.whyItMatters,
              opportunities: genResult.data.opportunities,
              risks: genResult.data.risks,
              status: "completed",
              error_message: null,
              attempts,
              last_attempt_at: new Date().toISOString(),
              generated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "story_id" }
          );

        if (upsertErr) {
          stats.failed++;
          stats.errors.push(`Save error for "${story.canonical_title}": ${upsertErr.message}`);
        } else {
          stats.succeeded++;
          console.log(`[Gemini Pipeline] Successfully generated intelligence for story "${story.canonical_title}".`);
        }
      } else {
        stats.failed++;
        const errMsg = genResult.error || "Generation failed";
        stats.errors.push(`AI error for "${story.canonical_title}": ${errMsg}`);

        // Mark as failed in DB so it doesn't immediately repeat
        await client
          .from("story_intelligence")
          .upsert(
            {
              story_id: story.id,
              model: genResult.model,
              prompt_version: CURRENT_AI_PROMPT_VERSION,
              summary: "Intelligence generation pending",
              key_points: [],
              why_it_matters: "",
              opportunities: [],
              risks: [],
              status: "failed",
              error_message: errMsg,
              attempts,
              last_attempt_at: new Date().toISOString(),
              generated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "story_id" }
          );

        // If rate limit encountered, break early to respect quota
        if (genResult.isRateLimited) {
          stats.rateLimited = true;
          console.warn(`[Gemini Pipeline] Halting remaining batch processing due to rate limit.`);
          break;
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Unexpected pipeline error: ${msg}`);
    console.error(`[Gemini Pipeline] Unexpected error:`, err);
  }

  stats.durationMs = Date.now() - startTime;
  return stats;
}
