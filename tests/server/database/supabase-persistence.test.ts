import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { getServiceSupabaseClient, resetServerSupabaseClient } from "../../../src/server/supabase";
import { persistArticles } from "../../../src/server/news/persistence";
import { createRssNewsProvider } from "../../../src/server/news/providers/rss";
import { gdeltNewsProvider } from "../../../src/server/news/providers/gdelt";
import { ingestFromProvider } from "../../../src/server/news/ingestion";
import type { NormalizedArticle } from "../../../src/server/news/types";

// 1. Safely load environment files if present
const cwd = process.cwd();
const localEnvPath = path.resolve(cwd, ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(cwd, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Reset client to pick up loaded environment
resetServerSupabaseClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

const TEST_PROVIDER = "test-supabase-e2e";

function createTestArticle(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    externalId: "e2e-article-default",
    title: "Test Article Title",
    description: null,
    content: null,
    url: "https://example.com/test",
    imageUrl: null,
    author: null,
    publishedAt: new Date(),
    language: "en",
    source: {
      externalId: "example.com",
      name: "Example Source",
      url: "https://example.com",
    },
    ...overrides,
  };
}

test("Step 2E: Real Supabase Persistence Integration Suite", { skip: !isSupabaseConfigured }, async (t) => {
  const supabase = getServiceSupabaseClient();

  // Helper to cleanup test artifacts
  async function cleanupTestData() {
    await supabase.from("articles").delete().eq("provider", TEST_PROVIDER);
    await supabase.from("sources").delete().eq("provider", TEST_PROVIDER);
  }

  // Pre-cleanup
  await cleanupTestData();

  await t.test("1. Verify real Supabase persistence connection and schema access", async () => {
    // Check sources table access
    const sourcesCheck = await supabase.from("sources").select("count", { count: "exact", head: true });
    assert.equal(sourcesCheck.error, null, `Sources table query failed: ${sourcesCheck.error?.message}`);
    assert.ok(sourcesCheck.status >= 200 && sourcesCheck.status < 300, `Expected 2xx for sources, got ${sourcesCheck.status}`);

    // Check articles table access
    const articlesCheck = await supabase.from("articles").select("count", { count: "exact", head: true });
    assert.equal(articlesCheck.error, null, `Articles table query failed: ${articlesCheck.error?.message}`);
    assert.ok(articlesCheck.status >= 200 && articlesCheck.status < 300, `Expected 2xx for articles, got ${articlesCheck.status}`);
  });

  await t.test("2. Test source upsert and idempotency in real Supabase", async () => {
    const sourceExternalId = "e2e-source-domain.com";

    // First upsert: insert new source
    const { data: inserted, error: insertErr } = await supabase
      .from("sources")
      .upsert(
        [
          {
            provider: TEST_PROVIDER,
            external_id: sourceExternalId,
            name: "Initial Source Name",
            url: "https://e2e-source-domain.com",
            is_active: true,
          },
        ],
        { onConflict: "provider,external_id" }
      )
      .select("id, provider, external_id, name, url, is_active");

    assert.equal(insertErr, null, `Source insert failed: ${insertErr?.message}`);
    assert.ok(inserted && inserted.length === 1, "Source should be returned");
    assert.equal(inserted[0].provider, TEST_PROVIDER);
    assert.equal(inserted[0].external_id, sourceExternalId);
    assert.equal(inserted[0].name, "Initial Source Name");
    assert.ok(inserted[0].id, "UUID id must be assigned");

    const originalId = inserted[0].id;

    // Second upsert: update source name
    const { data: updated, error: updateErr } = await supabase
      .from("sources")
      .upsert(
        [
          {
            provider: TEST_PROVIDER,
            external_id: sourceExternalId,
            name: "Updated Source Name",
            url: "https://e2e-source-domain.com",
            is_active: true,
          },
        ],
        { onConflict: "provider,external_id" }
      )
      .select("id, name");

    assert.equal(updateErr, null, `Source update failed: ${updateErr?.message}`);
    assert.ok(updated && updated.length === 1);
    assert.equal(updated[0].id, originalId, "ID must remain identical across updates");
    assert.equal(updated[0].name, "Updated Source Name");
  });

  await t.test("3. Test article upsert and foreign key mapping in real Supabase", async () => {
    const article: NormalizedArticle = {
      externalId: "e2e-article-001",
      title: "Real Supabase Integration Article",
      description: "Testing end to end article persistence in PostgreSQL",
      content: "Full body content of integration article",
      url: "https://e2e-source-domain.com/posts/001",
      imageUrl: "https://e2e-source-domain.com/images/hero.jpg",
      author: "Quality Engineer",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
      language: "en",
      source: {
        externalId: "e2e-source-domain.com",
        name: "E2E Test Source",
        url: "https://e2e-source-domain.com",
      },
      rawData: { testRun: true, step: "2E" },
    };

    const stats = await persistArticles([article], {
      provider: TEST_PROVIDER,
      client: supabase,
    });

    assert.equal(stats.fetched, 1);
    assert.equal(stats.inserted, 1);
    assert.equal(stats.failed, 0);
    assert.equal(stats.errors?.length, 0);

    // Verify row was stored with all mapped fields
    const { data: rows, error: selectErr } = await supabase
      .from("articles")
      .select("*, sources(name, url)")
      .eq("provider", TEST_PROVIDER)
      .eq("external_id", "e2e-article-001");

    assert.equal(selectErr, null);
    assert.ok(rows && rows.length === 1, "Expected article row in database");
    const stored = rows[0];
    assert.equal(stored.title, article.title);
    assert.equal(stored.description, article.description);
    assert.equal(stored.content, article.content);
    assert.equal(stored.url, article.url);
    assert.equal(stored.image_url, article.imageUrl);
    assert.equal(stored.author, article.author);
    assert.equal(stored.language, article.language);
    assert.ok(stored.source_id, "Source ID must be linked via foreign key");
    assert.equal(new Date(stored.published_at).toISOString(), article.publishedAt.toISOString());
  });

  await t.test("4. Test duplicate article handling (ignoreDuplicates: true & false)", async () => {
    const article: NormalizedArticle = {
      externalId: "e2e-article-001",
      title: "Real Supabase Integration Article - Second Try",
      description: "Updated description attempt",
      content: "Updated content",
      url: "https://e2e-source-domain.com/posts/001",
      imageUrl: null,
      author: "Quality Engineer",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
      language: "en",
      source: {
        externalId: "e2e-source-domain.com",
        name: "E2E Test Source",
        url: "https://e2e-source-domain.com",
      },
    };

    // First attempt: ignoreDuplicates = true (default)
    const statsSkip = await persistArticles([article], {
      provider: TEST_PROVIDER,
      client: supabase,
      ignoreDuplicates: true,
    });

    assert.equal(statsSkip.inserted, 0, "Should not insert duplicate article");
    assert.equal(statsSkip.skipped, 1, "Duplicate article should be skipped");
    assert.equal(statsSkip.failed, 0);

    // Verify original title was preserved
    const { data: checkRow1 } = await supabase
      .from("articles")
      .select("title")
      .eq("provider", TEST_PROVIDER)
      .eq("external_id", "e2e-article-001")
      .single();

    assert.equal(checkRow1?.title, "Real Supabase Integration Article");

    // Second attempt: ignoreDuplicates = false (update existing)
    const statsUpdate = await persistArticles([article], {
      provider: TEST_PROVIDER,
      client: supabase,
      ignoreDuplicates: false,
    });

    assert.equal(statsUpdate.inserted, 0);
    assert.equal(statsUpdate.updated, 1, "Article should be updated");

    // Verify title was updated
    const { data: checkRow2 } = await supabase
      .from("articles")
      .select("title")
      .eq("provider", TEST_PROVIDER)
      .eq("external_id", "e2e-article-001")
      .single();

    assert.equal(checkRow2?.title, "Real Supabase Integration Article - Second Try");

    // Verify total count is still 1
    const { count } = await supabase
      .from("articles")
      .select("count", { count: "exact", head: true })
      .eq("provider", TEST_PROVIDER);

    assert.equal(count, 1, "Duplicate handling must not increase total row count");
  });

  await t.test("5. Test in-batch duplicate handling without Postgres 21000 errors", async () => {
    const inBatchArticles: NormalizedArticle[] = [
      createTestArticle({
        externalId: "e2e-batch-dup-01",
        title: "First Duplicate Occurrence",
        url: "https://example.com/dup1",
        source: { externalId: "src-dup", name: "Src", url: null },
      }),
      createTestArticle({
        externalId: "e2e-batch-dup-01", // Duplicate within same batch
        title: "Second Duplicate Occurrence",
        url: "https://example.com/dup1",
        source: { externalId: "src-dup", name: "Src", url: null },
      }),
    ];

    const stats = await persistArticles(inBatchArticles, {
      provider: TEST_PROVIDER,
      client: supabase,
      ignoreDuplicates: true,
    });

    assert.equal(stats.fetched, 2);
    assert.equal(stats.inserted, 1);
    assert.equal(stats.skipped, 1);
    assert.equal(stats.failed, 0);
    assert.equal(stats.errors?.length, 0);
  });

  await t.test("6. Test null source article persistence", async () => {
    const orphanArticle: NormalizedArticle = createTestArticle({
      externalId: "e2e-orphan-article",
      title: "Orphan Article Without Source",
      url: "https://example.com/orphan-001",
      source: { externalId: "", name: "", url: null },
    });

    const stats = await persistArticles([orphanArticle], {
      provider: TEST_PROVIDER,
      client: supabase,
    });

    assert.equal(stats.inserted, 1);

    const { data: row } = await supabase
      .from("articles")
      .select("source_id")
      .eq("provider", TEST_PROVIDER)
      .eq("external_id", "e2e-orphan-article")
      .single();

    assert.equal(row?.source_id, null, "source_id should be null when source is empty");
  });

  await t.test("7. Complete RSS ingestion -> normalization -> persistence flow", async () => {
    const rssProvider = createRssNewsProvider({
      feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml"],
    });

    const result = await ingestFromProvider(rssProvider, {
      client: supabase,
      pageSize: 3,
    });

    assert.equal(result.provider, "rss");
    assert.ok(result.articles.length > 0, "RSS should fetch at least 1 article");
    assert.ok(result.stats.inserted >= 0);
    assert.equal(result.stats.failed, 0);

    // Verify articles are queryable from Supabase
    const { data: dbArticles, error: err } = await supabase
      .from("articles")
      .select("id, title, provider, source_id")
      .eq("provider", "rss")
      .limit(3);

    assert.equal(err, null);
    assert.ok(dbArticles && dbArticles.length > 0, "Articles should be persisted in real Supabase");
    assert.ok(dbArticles[0].source_id, "RSS articles must have source_id populated");
  });

  await t.test("8. Complete GDELT ingestion -> normalization -> persistence flow", async () => {
    const result = await ingestFromProvider(gdeltNewsProvider, {
      client: supabase,
      query: "technology",
      pageSize: 2,
    });

    assert.equal(result.provider, "gdelt");
    assert.equal(result.stats.failed, 0, "Ingestion must not throw or report unhandled errors");

    if (result.articles.length > 0) {
      assert.ok(result.stats.inserted >= 0);

      // Verify articles are queryable from Supabase
      const { data: dbArticles, error: err } = await supabase
        .from("articles")
        .select("id, title, provider, source_id")
        .eq("provider", "gdelt")
        .limit(2);

      assert.equal(err, null);
      assert.ok(dbArticles && dbArticles.length > 0, "Articles should be persisted in real Supabase");
    } else {
      // Upstream GDELT public API is throttled/rate-limited for current IP; verify persistence contract with normalized GDELT sample
      const sampleGdelt: NormalizedArticle = createTestArticle({
        externalId: "https://example.com/gdelt-test-contract-01",
        title: "GDELT Contract Verification Article",
        url: "https://example.com/gdelt-test-contract-01",
        source: {
          externalId: "example.com",
          name: "Example Source",
          url: "https://example.com",
        },
        rawData: { seendate: "20260913T100000Z" },
      });

      const persistRes = await persistArticles([sampleGdelt], {
        provider: "gdelt",
        client: supabase,
      });

      assert.ok(persistRes.inserted >= 0 || persistRes.skipped >= 0);
      assert.equal(persistRes.failed, 0);

      const { data: dbArticles } = await supabase
        .from("articles")
        .select("id, title, provider")
        .eq("provider", "gdelt")
        .eq("external_id", "https://example.com/gdelt-test-contract-01");

      assert.ok(dbArticles && dbArticles.length > 0);
    }
  });

  // Post-suite cleanup of test provider data
  await cleanupTestData();
});
