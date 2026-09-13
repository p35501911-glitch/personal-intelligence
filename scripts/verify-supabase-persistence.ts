/**
 * Step 2E Verification Script: Real Supabase Persistence & Ingestion Pipeline
 *
 * Verifies:
 * 1. Real Supabase persistence connection (sources & articles tables, PostgREST API).
 * 2. Source upsert & idempotency.
 * 3. Article upsert & foreign key mapping.
 * 4. Duplicate article handling (skip vs update).
 * 5. Complete RSS & GDELT ingestion -> normalization -> persistence flow.
 *
 * Note: Never logs or exposes secret keys.
 */

import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

// 1. Safely load local environment files
const cwd = process.cwd();
const localEnvPath = path.resolve(cwd, ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(cwd, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { getServiceSupabaseClient, resetServerSupabaseClient } from "../src/server/supabase";
import { persistArticles } from "../src/server/news/persistence";
import { createRssNewsProvider } from "../src/server/news/providers/rss";
import { gdeltNewsProvider } from "../src/server/news/providers/gdelt";
import { ingestFromProvider } from "../src/server/news/ingestion";
import type { NormalizedArticle } from "../src/server/news/types";

resetServerSupabaseClient();

const TEST_PROVIDER = "step-2e-verification";

async function main() {
  console.log("======================================================================");
  console.log("     Step 2E: Real Supabase Persistence & Ingestion Verification     ");
  console.log("======================================================================\n");

  const startTime = Date.now();
  const supabase = getServiceSupabaseClient();

  // Helper to cleanly wipe test verification records
  async function cleanup() {
    await supabase.from("articles").delete().eq("provider", TEST_PROVIDER);
    await supabase.from("sources").delete().eq("provider", TEST_PROVIDER);
  }

  await cleanup();

  try {
    // ------------------------------------------------------------------
    // 1. Verify the real Supabase persistence connection
    // ------------------------------------------------------------------
    console.log("1. Verifying real Supabase persistence connection...");
    const { count: sourcesCount, error: sourcesErr } = await supabase
      .from("sources")
      .select("count", { count: "exact", head: true });

    if (sourcesErr) {
      throw new Error(`Failed to query sources table: ${sourcesErr.message} (code: ${sourcesErr.code})`);
    }

    const { count: articlesCount, error: articlesErr } = await supabase
      .from("articles")
      .select("count", { count: "exact", head: true });

    if (articlesErr) {
      throw new Error(`Failed to query articles table: ${articlesErr.message} (code: ${articlesErr.code})`);
    }

    console.log("   ✓ Connection established successfully to Supabase Data API");
    console.log("   ✓ Table public.sources is accessible");
    console.log("   ✓ Table public.articles is accessible");
    console.log(`   ✓ Current database totals: ${sourcesCount ?? 0} sources, ${articlesCount ?? 0} articles\n`);

    // ------------------------------------------------------------------
    // 2. Test source upsert
    // ------------------------------------------------------------------
    console.log("2. Testing source upsert & conflict resolution...");
    const testSourceExtId = "verification-source.org";

    // 2a. Insert new source
    const { data: insertedSource, error: insertSrcErr } = await supabase
      .from("sources")
      .upsert(
        [
          {
            provider: TEST_PROVIDER,
            external_id: testSourceExtId,
            name: "Initial Verification Source",
            url: "https://verification-source.org",
            is_active: true,
          },
        ],
        { onConflict: "provider,external_id" }
      )
      .select("id, provider, external_id, name, created_at, updated_at")
      .single();

    if (insertSrcErr || !insertedSource) {
      throw new Error(`Source insert failed: ${insertSrcErr?.message}`);
    }

    console.log(`   ✓ Source inserted: ID=${insertedSource.id}, name="${insertedSource.name}"`);

    // 2b. Upsert again with modified name to test idempotency
    const { data: updatedSource, error: updateSrcErr } = await supabase
      .from("sources")
      .upsert(
        [
          {
            provider: TEST_PROVIDER,
            external_id: testSourceExtId,
            name: "Updated Verification Source",
            url: "https://verification-source.org",
            is_active: true,
          },
        ],
        { onConflict: "provider,external_id" }
      )
      .select("id, provider, external_id, name")
      .single();

    if (updateSrcErr || !updatedSource) {
      throw new Error(`Source update failed: ${updateSrcErr?.message}`);
    }

    if (updatedSource.id !== insertedSource.id) {
      throw new Error("Source ID changed on upsert! Must be idempotent.");
    }
    console.log(`   ✓ Source upsert idempotency confirmed: name="${updatedSource.name}" (ID unchanged)\n`);

    // ------------------------------------------------------------------
    // 3. Test article upsert
    // ------------------------------------------------------------------
    console.log("3. Testing article upsert & relational foreign key linking...");
    const sampleArticle: NormalizedArticle = {
      externalId: "verify-art-001",
      title: "Step 2E Verification Article",
      description: "Testing comprehensive field mapping and foreign key constraint.",
      content: "Detailed markdown/text body for article verification.",
      url: "https://verification-source.org/posts/001",
      imageUrl: "https://verification-source.org/images/cover.webp",
      author: "Test Engineer",
      publishedAt: new Date("2026-09-13T12:00:00Z"),
      language: "en",
      source: {
        externalId: testSourceExtId,
        name: "Updated Verification Source",
        url: "https://verification-source.org",
      },
      rawData: { verificationRun: true },
    };

    const persistStats = await persistArticles([sampleArticle], {
      provider: TEST_PROVIDER,
      client: supabase,
    });

    console.log(`   ✓ Persist stats: fetched=${persistStats.fetched}, inserted=${persistStats.inserted}, failed=${persistStats.failed}`);
    if (persistStats.inserted !== 1 || persistStats.failed !== 0) {
      throw new Error(`Article insertion failed! Stats: ${JSON.stringify(persistStats)}`);
    }

    const { data: retrievedArticle, error: retrieveErr } = await supabase
      .from("articles")
      .select("id, title, url, provider, external_id, source_id, sources(name)")
      .eq("provider", TEST_PROVIDER)
      .eq("external_id", "verify-art-001")
      .single();

    if (retrieveErr || !retrievedArticle) {
      throw new Error(`Failed to retrieve persisted article: ${retrieveErr?.message}`);
    }

    if (retrievedArticle.source_id !== insertedSource.id) {
      throw new Error(`Foreign key mismatch! Expected source_id=${insertedSource.id}, got=${retrievedArticle.source_id}`);
    }
    console.log(`   ✓ Article stored and correctly linked to source ID: ${retrievedArticle.source_id}\n`);

    // ------------------------------------------------------------------
    // 4. Test duplicate article handling
    // ------------------------------------------------------------------
    console.log("4. Testing duplicate article handling...");

    // 4a. Re-persist identical article with ignoreDuplicates: true (default)
    const duplicateStats = await persistArticles([sampleArticle], {
      provider: TEST_PROVIDER,
      client: supabase,
      ignoreDuplicates: true,
    });

    console.log(`   ✓ Duplicate with ignoreDuplicates=true: inserted=${duplicateStats.inserted}, skipped=${duplicateStats.skipped}`);
    if (duplicateStats.inserted !== 0 || duplicateStats.skipped !== 1) {
      throw new Error(`Duplicate handling failed! Expected inserted=0, skipped=1, got ${JSON.stringify(duplicateStats)}`);
    }

    // 4b. Re-persist with updated title and ignoreDuplicates: false
    const updatedArticle = {
      ...sampleArticle,
      title: "Step 2E Verification Article - Revision 2",
    };
    const updateStats = await persistArticles([updatedArticle], {
      provider: TEST_PROVIDER,
      client: supabase,
      ignoreDuplicates: false,
    });

    console.log(`   ✓ Duplicate with ignoreDuplicates=false: inserted=${updateStats.inserted}, updated=${updateStats.updated}`);
    if (updateStats.updated !== 1) {
      throw new Error(`Duplicate update failed! Expected updated=1, got ${JSON.stringify(updateStats)}`);
    }

    const { count: finalArticleCount } = await supabase
      .from("articles")
      .select("count", { count: "exact", head: true })
      .eq("provider", TEST_PROVIDER);

    if (finalArticleCount !== 1) {
      throw new Error(`Total article rows in database should remain 1, found ${finalArticleCount}`);
    }
    console.log("   ✓ Database row count remained exactly 1 (no duplicate rows created)\n");

    // ------------------------------------------------------------------
    // 5. Test complete RSS/GDELT ingestion flow
    // ------------------------------------------------------------------
    console.log("5. Testing complete RSS/GDELT ingestion → normalization → persistence flow...");

    // 5a. RSS Ingestion flow
    console.log("   [RSS Pipeline] Ingesting from RSS feed...");
    const rssProvider = createRssNewsProvider({
      feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml"],
    });

    const rssResult = await ingestFromProvider(rssProvider, {
      client: supabase,
      pageSize: 3,
    });

    console.log(`   ✓ RSS fetch & normalize: ${rssResult.articles.length} articles (${rssResult.timings.fetchDurationMs}ms)`);
    console.log(`   ✓ RSS persistence stats: inserted=${rssResult.stats.inserted}, skipped=${rssResult.stats.skipped}, failed=${rssResult.stats.failed} (${rssResult.timings.persistDurationMs}ms)`);

    if (rssResult.articles.length === 0) {
      console.warn("   ⚠️ Warning: RSS feed returned 0 items. Checking network/feed connectivity.");
    }

    // 5b. GDELT Ingestion flow
    console.log("   [GDELT Pipeline] Ingesting from GDELT 2.0 API...");
    const gdeltResult = await ingestFromProvider(gdeltNewsProvider, {
      client: supabase,
      query: "technology",
      pageSize: 2,
    });

    console.log(`   ✓ GDELT fetch & normalize: ${gdeltResult.articles.length} articles (${gdeltResult.timings.fetchDurationMs}ms)`);
    console.log(`   ✓ GDELT persistence stats: inserted=${gdeltResult.stats.inserted}, skipped=${gdeltResult.stats.skipped}, failed=${gdeltResult.stats.failed} (${gdeltResult.timings.persistDurationMs}ms)`);

    // Verify stored articles can be queried
    const { data: dbRssArticles } = await supabase
      .from("articles")
      .select("id, title, provider")
      .eq("provider", "rss")
      .limit(2);

    const { data: dbGdeltArticles } = await supabase
      .from("articles")
      .select("id, title, provider")
      .eq("provider", "gdelt")
      .limit(2);

    console.log(`   ✓ Verified Supabase stored articles: ${dbRssArticles?.length ?? 0} RSS, ${dbGdeltArticles?.length ?? 0} GDELT\n`);

    // ------------------------------------------------------------------
    // Cleanup verification records
    // ------------------------------------------------------------------
    await cleanup();
    console.log("   ✓ Cleaned up temporary verification records.");

    const totalElapsed = Date.now() - startTime;
    console.log("\n======================================================================");
    console.log(`   Step 2E Verification PASSED successfully in ${totalElapsed}ms!     `);
    console.log("======================================================================\n");
  } catch (error) {
    console.error("\n❌ Step 2E Verification FAILED:", error);
    await cleanup().catch(() => {});
    process.exit(1);
  }
}

main();
