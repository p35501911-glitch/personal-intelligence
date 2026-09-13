import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../supabase";
import { getGeminiConfig, isGeminiConfigured } from "./client";
import { classifyStoryWithFlashLite, isValidTaxonomySlug } from "./classifier";
import { generateImportantStoryIntelligence } from "./service";
import { tagStoryWithCategories, getCategorySlugToIdMap } from "../news/categories/service";
import { getTaxonomyIndex } from "../news/categories/keywords";
import type { StoryInputForAI } from "./types";
import type { GoogleGenAI } from "@google/genai";

export interface AIPipelineStats {
  totalEligible: number;
  processed: number;
  succeeded: number;
  normal: number;
  important: number;
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

async function saveStoryIntelligenceWithFallback(
  client: SupabaseClient<Database>,
  payload: Record<string, unknown>
): Promise<{ error: { message: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await client.from("story_intelligence").upsert(payload as any, {
    onConflict: "story_id",
  });

  if (error && error.message.includes("tier")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.tier;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await client.from("story_intelligence").upsert(fallbackPayload as any, {
      onConflict: "story_id",
    });
  }

  return { error };
}

/**
 * Executes Two-Tier Free Gemini AI intelligence processing for pending stories:
 *
 * Tier 1: Flash-Lite Triage (single call for relevance + 50-category mapping + importance score + normal summary)
 * Tier 2: Flash Deep Synthesis (called ONLY if importance >= 0.70)
 */
export async function processPendingStoryIntelligence(options?: {
  supabaseClient?: SupabaseClient<Database>;
  geminiClient?: GoogleGenAI | null;
  limit?: number;
  concurrency?: number;
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
    normal: 0,
    important: 0,
    failed: 0,
    skipped: 0,
    rateLimited: false,
    durationMs: 0,
    errors: [],
  };

  // Check if AI is enabled and Gemini configured
  if (!config.enabled || (!isGeminiConfigured() && !options?.geminiClient)) {
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
      .limit(limit * 3); // Wider pool to filter already-processed

    if (storiesErr || !storiesData || storiesData.length === 0) {
      if (storiesErr) stats.errors.push(`Stories fetch error: ${storiesErr.message}`);
      stats.durationMs = Date.now() - startTime;
      return stats;
    }

    // 2. Fetch existing intelligence records to identify already-analyzed stories
    const storyIds = storiesData.map((s) => s.id);
    let { data: existingIntel, error: intelErr } = await client
      .from("story_intelligence")
      .select("story_id, model, prompt_version, tier, status, attempts, updated_at")
      .in("story_id", storyIds);

    if (intelErr && intelErr.message.includes("tier")) {
      // Retry without tier if migration has not run yet
      const fallback = await client
        .from("story_intelligence")
        .select("story_id, model, prompt_version, status, attempts, updated_at")
        .in("story_id", storyIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingIntel = (fallback.data || []).map((r) => ({ ...r, tier: "normal" })) as any;
      intelErr = fallback.error;
    }

    if (intelErr) {
      stats.errors.push(`Intelligence fetch notice: ${intelErr.message}`);
    }

    const intelMap = new Map<string, {
      model: string;
      promptVersion: number;
      tier: string;
      status: string;
      attempts: number;
    }>();

    for (const row of existingIntel || []) {
      intelMap.set(row.story_id, {
        model: row.model,
        promptVersion: row.prompt_version,
        tier: row.tier,
        status: row.status,
        attempts: row.attempts,
      });
    }

    // 3. Filter eligible stories
    const eligibleStories = storiesData.filter((story) => {
      if (forceRegenerate) return true;
      const existing = intelMap.get(story.id);
      if (!existing) return true; // No record exists

      // Re-run if prompt version is outdated
      if (existing.promptVersion < config.promptVersion) {
        return true;
      }

      // If previously completed, skip (cache hit!)
      if (existing.status === "completed") {
        return false;
      }

      // If failed but under max attempts, allow retry
      if (existing.status === "failed" && existing.attempts <= config.maxRetries) {
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
    let flashModelExhausted = false;
    for (let i = 0; i < eligibleStories.length; i++) {
      const story = eligibleStories[i];
      stats.processed++;

      // Inter-request rate limit spacing (2,000ms delay between stories to stay under 15 RPM)
      if (i > 0) {
        await sleep(2000);
      }

      // Fetch attached articles and categories for context
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
          categories = (catRows as unknown as CategoryJoinRow[])
            .filter((r) => r.categories !== null)
            .map((r) => ({
              categoryName: r.categories!.name,
              isPrimary: r.is_primary,
            }));
        }
      } catch {
        // Non-fatal
      }

      const storyInput: StoryInputForAI = {
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

      // =========================================================================
      // STEP 1: Flash-Lite Triage (relevance + 50 categories + importance + brief)
      // =========================================================================
      const triage = await classifyStoryWithFlashLite(storyInput, {
        client: options?.geminiClient,
        model: config.flashLiteModel,
        threshold: config.importantThreshold,
        maxRetries: config.maxRetries,
        timeoutMs: config.timeoutMs,
      });

      if (!triage.success && triage.isRateLimited) {
        stats.rateLimited = true;
        stats.failed++;
        stats.errors.push(`Flash-Lite Rate limited on story "${storyInput.canonicalTitle}"`);
        console.warn(`[AI Pipeline] Halting remaining batch processing due to rate limit.`);
        break;
      }

      if (!triage.success) {
        stats.failed++;
        stats.errors.push(`Flash-Lite triage error for "${storyInput.canonicalTitle}": ${triage.error}`);
        // Record failure in DB so we don't retry endlessly
        await saveStoryIntelligenceWithFallback(client, {
          story_id: story.id,
          model: config.flashLiteModel,
          prompt_version: config.promptVersion,
          tier: "normal",
          summary: storyInput.summary || storyInput.canonicalTitle,
          key_points: [storyInput.canonicalTitle],
          why_it_matters: "",
          opportunities: [],
          risks: [],
          status: "failed",
          error_message: triage.error,
          attempts: (intelMap.get(story.id)?.attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      // If marked irrelevant by AI, skip deep analysis and record as completed normal
      if (!triage.data.relevant) {
        stats.skipped++;
        await saveStoryIntelligenceWithFallback(client, {
          story_id: story.id,
          model: config.flashLiteModel,
          prompt_version: config.promptVersion,
          tier: "normal",
          summary: triage.data.summary || storyInput.canonicalTitle,
          key_points: triage.data.keyPoints.length > 0 ? triage.data.keyPoints : [storyInput.canonicalTitle],
          why_it_matters: "",
          opportunities: [],
          risks: [],
          status: "completed",
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      // =========================================================================
      // STEP 2: Save AI-identified 50-taxonomy categories to story_categories
      // =========================================================================
      if (triage.data.categorySlugs && triage.data.categorySlugs.length > 0) {
        try {
          const slugMap = await getCategorySlugToIdMap(client);
          const { slugMap: taxMap, categoryMap: idMap } = getTaxonomyIndex();
          const validMatches = triage.data.categorySlugs
            .filter((slug) => isValidTaxonomySlug(slug))
            .map((slug, idx) => {
              const rule = taxMap.get(slug);
              const resolvedRootSlug = rule ? (idMap.get(rule.rootId)?.slug || rule.rootId) : slug;
              const resolvedParentSlug = rule?.parentId ? (idMap.get(rule.parentId)?.slug || rule.parentId) : undefined;
              return {
                categoryId: slugMap.get(slug) || rule?.id || slug,
                categorySlug: slug,
                categoryName: rule?.name || slug,
                rootId: rule?.rootId || slug,
                rootSlug: resolvedRootSlug,
                parentId: rule?.parentId,
                parentSlug: resolvedParentSlug,
                level: (rule?.level as 1 | 2 | 3) || 1,
                confidence: Math.max(0.7, 0.95 - idx * 0.1),
                isPrimary: idx === 0,
                matchedRule: "gemini-flash-lite-ai",
              };
            });

          if (validMatches.length > 0) {
            await tagStoryWithCategories(story.id, validMatches, client);
          }
        } catch (catErr) {
          console.warn(`[AI Pipeline] Non-fatal category tagging notice for story "${story.id}":`, catErr);
        }
      }

      // =========================================================================
      // STEP 3: Branching by Tier (Normal vs Important)
      // =========================================================================
      const isImportant = triage.data.tier === "important";

      if (!isImportant) {
        // -----------------------------------------------------------------------
        // NORMAL STORY: Exactly ONE Flash-Lite call total!
        // Directly persist the Flash-Lite brief (summary + keyPoints).
        // -----------------------------------------------------------------------
        try {
          const { error: saveErr } = await saveStoryIntelligenceWithFallback(client, {
            story_id: story.id,
            model: config.flashLiteModel,
            prompt_version: config.promptVersion,
            tier: "normal",
            summary: triage.data.summary,
            key_points: triage.data.keyPoints,
            why_it_matters: "",
            opportunities: [],
            risks: [],
            status: "completed",
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (saveErr) {
            stats.failed++;
            stats.errors.push(`Failed to save normal intelligence for "${story.id}": ${saveErr.message}`);
          } else {
            stats.succeeded++;
            stats.normal++;
            console.log(`[AI Pipeline] Generated Flash-Lite brief (Normal) for "${storyInput.canonicalTitle}".`);
          }
        } catch (saveException) {
          stats.failed++;
          stats.errors.push(`Exception saving normal intelligence: ${String(saveException)}`);
        }
      } else if (!config.deepAnalysisEnabled || flashModelExhausted) {
        // Step 5 Free-tier constraint: Flash deep-analysis stage can be disabled or
        // gracefully fall back to Flash-Lite brief if Flash is disabled or quota was exhausted.
        await saveStoryIntelligenceWithFallback(client, {
          story_id: story.id,
          model: config.flashLiteModel,
          prompt_version: config.promptVersion,
          tier: "important",
          summary: triage.data.summary,
          key_points: triage.data.keyPoints,
          why_it_matters: "High-significance breaking event flagged by intelligence triage.",
          opportunities: [],
          risks: [],
          status: "completed",
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        stats.succeeded++;
        stats.important++;
        if (!config.deepAnalysisEnabled) {
          console.log(`[AI Pipeline] Saved Flash-Lite brief for important story "${storyInput.canonicalTitle}" (deep analysis disabled via AI_DEEP_ANALYSIS_ENABLED=false).`);
        } else {
          console.log(`[AI Pipeline] Saved Flash-Lite brief fallback for important story "${storyInput.canonicalTitle}" (Flash quota exhausted).`);
        }
      } else {
        // -----------------------------------------------------------------------
        // IMPORTANT STORY: Flash-Lite triage + Flash deep-analysis call!
        // -----------------------------------------------------------------------
        // Rate-limit spacing before second call
        await sleep(2000);

        const deepGen = await generateImportantStoryIntelligence(storyInput, {
          client: options?.geminiClient,
          model: config.flashModel,
          maxRetries: config.maxRetries,
          timeoutMs: config.timeoutMs,
        });

        if (!deepGen.success && deepGen.isRateLimited) {
          stats.rateLimited = true;
          flashModelExhausted = true;
          // Gracefully save the Flash-Lite brief as fallback so we don't lose value
          await saveStoryIntelligenceWithFallback(client, {
            story_id: story.id,
            model: config.flashLiteModel,
            prompt_version: config.promptVersion,
            tier: "important",
            summary: triage.data.summary,
            key_points: triage.data.keyPoints,
            why_it_matters: "High-significance breaking event flagged by intelligence triage.",
            opportunities: [],
            risks: [],
            status: "completed",
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          stats.succeeded++;
          stats.important++;
          stats.errors.push(`Flash rate-limited on "${storyInput.canonicalTitle}"; saved Flash-Lite brief fallback.`);
          console.warn(`[AI Pipeline] Flash quota exhausted on "${storyInput.canonicalTitle}"; continuing remaining batch with Flash-Lite fallback.`);
          continue;
        }

        if (!deepGen.success || !deepGen.data) {
          // Fallback to Flash-Lite brief with important tier
          await saveStoryIntelligenceWithFallback(client, {
            story_id: story.id,
            model: config.flashLiteModel,
            prompt_version: config.promptVersion,
            tier: "important",
            summary: triage.data.summary,
            key_points: triage.data.keyPoints,
            why_it_matters: "High-impact story identified by intelligence triage.",
            opportunities: [],
            risks: [],
            status: "completed",
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          stats.succeeded++;
          stats.important++;
          console.warn(`[AI Pipeline] Flash deep analysis failed for "${storyInput.canonicalTitle}"; saved Flash-Lite brief.`);
        } else {
          // Persist full deep Flash intelligence
          const { error: deepSaveErr } = await saveStoryIntelligenceWithFallback(client, {
            story_id: story.id,
            model: config.flashModel,
            prompt_version: config.promptVersion,
            tier: "important",
            summary: deepGen.data.summary,
            key_points: deepGen.data.keyPoints,
            why_it_matters: deepGen.data.whyItMatters || "",
            opportunities: deepGen.data.opportunities || [],
            risks: deepGen.data.risks || [],
            status: "completed",
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (deepSaveErr) {
            stats.failed++;
            stats.errors.push(`Failed to save deep intelligence: ${deepSaveErr.message}`);
          } else {
            stats.succeeded++;
            stats.important++;
            console.log(`[AI Pipeline] Generated Flash deep analysis (Important) for "${storyInput.canonicalTitle}".`);
          }
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Unexpected error: ${msg}`);
    console.error(`[AI Pipeline] Unexpected error:`, err);
  }

  stats.durationMs = Date.now() - startTime;
  return stats;
}
