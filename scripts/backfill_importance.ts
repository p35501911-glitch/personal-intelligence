/**
 * Story Importance Scoring Backfill Script
 *
 * Recalculates and updates `importance_score` for all existing stories in Supabase.
 *
 * Usage:
 *   npx tsx scripts/backfill_importance.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { getServiceSupabaseClient } from "../src/server/supabase";
import { computeStoryImportance } from "../src/server/news/importance";

async function main() {
  console.log("[Backfill] Starting Story Importance Scoring Backfill...");
  const client = getServiceSupabaseClient();

  // 1. Fetch all stories
  const { data: stories, error: storiesErr } = await client
    .from("stories")
    .select("id, canonical_title, summary, first_published_at, latest_published_at, article_count, source_count, importance_score")
    .order("latest_published_at", { ascending: false });

  if (storiesErr || !stories) {
    console.error("[Backfill] Failed to fetch stories:", storiesErr);
    process.exit(1);
  }

  console.log(`[Backfill] Found ${stories.length} stories in database.`);

  // 2. Fetch all story_article links with article sources
  const { data: links, error: linksErr } = await client
    .from("story_articles")
    .select(`
      story_id,
      articles (
        id,
        source_id,
        sources (
          id,
          name,
          url
        )
      )
    `);

  if (linksErr) {
    console.warn("[Backfill] Warning: Failed to join story_articles with sources:", linksErr);
  }

  interface StoryArticleSourceJoin {
    story_id: string;
    articles: {
      id: string;
      source_id: string | null;
      sources: {
        id: string;
        name: string;
        url: string | null;
      } | null;
    } | null;
  }

  // Map story_id -> sources list
  const sourcesByStory = new Map<string, Array<{ name?: string | null; url?: string | null }>>();
  if (links) {
    for (const link of links as unknown as StoryArticleSourceJoin[]) {
      if (!sourcesByStory.has(link.story_id)) {
        sourcesByStory.set(link.story_id, []);
      }
      if (link.articles?.sources) {
        sourcesByStory.get(link.story_id)!.push({
          name: link.articles.sources.name,
          url: link.articles.sources.url,
        });
      }
    }
  }

  let updatedCount = 0;
  const levelCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  for (const story of stories) {
    const attachedSources = sourcesByStory.get(story.id) || [];

    const importance = computeStoryImportance({
      canonicalTitle: story.canonical_title,
      summary: story.summary,
      articleCount: story.article_count,
      sourceCount: story.source_count,
      firstPublishedAt: new Date(story.first_published_at),
      latestPublishedAt: new Date(story.latest_published_at),
      sources: attachedSources,
    });

    levelCounts[importance.level]++;

    const { error: updateErr } = await client
      .from("stories")
      .update({
        importance_score: importance.score,
      })
      .eq("id", story.id);

    if (updateErr) {
      console.error(`[Backfill] Error updating story ${story.id}:`, updateErr.message);
    } else {
      updatedCount++;
      console.log(
        `  ✔ [${importance.level.padEnd(8)}] Score: ${importance.score.toFixed(2)} | "${story.canonical_title.slice(0, 55)}..." (Sources: ${story.source_count}, Articles: ${story.article_count})`
      );
      if (importance.signals.length > 0) {
        console.log(`     ↳ Signals: ${importance.signals.join(", ")}`);
      }
    }
  }

  console.log("\n[Backfill] Summary:");
  console.log(`  Total Stories: ${stories.length}`);
  console.log(`  Updated: ${updatedCount}`);
  console.log(`  Distribution: CRITICAL=${levelCounts.CRITICAL}, HIGH=${levelCounts.HIGH}, MEDIUM=${levelCounts.MEDIUM}, LOW=${levelCounts.LOW}`);
  console.log("[Backfill] Completed successfully!");
}

main().catch((err) => {
  console.error("[Backfill] Fatal error:", err);
  process.exit(1);
});
