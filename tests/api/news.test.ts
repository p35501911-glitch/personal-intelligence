import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

// 1. Load environment variables
const cwd = process.cwd();
const localEnvPath = path.resolve(cwd, ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(cwd, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { GET, newsQuerySchema } from "../../src/app/api/news/route";
import { getPersistedArticles } from "../../src/server/news/reader";
import { getServiceSupabaseClient, resetServerSupabaseClient } from "../../src/server/supabase";

resetServerSupabaseClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

test("Step 2F: News Read API Query Schema Validation", async (t) => {
  await t.test("applies default limit and offset", () => {
    const result = newsQuerySchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.limit, 20);
      assert.equal(result.data.offset, 0);
      assert.equal(result.data.provider, undefined);
      assert.equal(result.data.categoryId, undefined);
    }
  });

  await t.test("accepts valid limit between 1 and 50", () => {
    const minResult = newsQuerySchema.safeParse({ limit: "1" });
    assert.equal(minResult.success, true);
    if (minResult.success) assert.equal(minResult.data.limit, 1);

    const maxResult = newsQuerySchema.safeParse({ limit: "50" });
    assert.equal(maxResult.success, true);
    if (maxResult.success) assert.equal(maxResult.data.limit, 50);

    const midResult = newsQuerySchema.safeParse({ limit: "25" });
    assert.equal(midResult.success, true);
    if (midResult.success) assert.equal(midResult.data.limit, 25);
  });

  await t.test("rejects limit less than 1 or greater than 50", () => {
    const underResult = newsQuerySchema.safeParse({ limit: "0" });
    assert.equal(underResult.success, false);

    const overResult = newsQuerySchema.safeParse({ limit: "51" });
    assert.equal(overResult.success, false);

    const negativeResult = newsQuerySchema.safeParse({ limit: "-10" });
    assert.equal(negativeResult.success, false);
  });

  await t.test("normalizes provider and accepts only rss or gdelt", () => {
    const rssResult = newsQuerySchema.safeParse({ provider: "rss" });
    assert.equal(rssResult.success, true);
    if (rssResult.success) assert.equal(rssResult.data.provider, "rss");

    const rssCapsResult = newsQuerySchema.safeParse({ provider: "RSS" });
    assert.equal(rssCapsResult.success, true);
    if (rssCapsResult.success) assert.equal(rssCapsResult.data.provider, "rss");

    const gdeltResult = newsQuerySchema.safeParse({ provider: "GDELT" });
    assert.equal(gdeltResult.success, true);
    if (gdeltResult.success) assert.equal(gdeltResult.data.provider, "gdelt");

    const invalidResult = newsQuerySchema.safeParse({ provider: "twitter" });
    assert.equal(invalidResult.success, false);
  });

  await t.test("accepts valid categoryId string", () => {
    const catResult = newsQuerySchema.safeParse({ categoryId: "cat-tech-ai" });
    assert.equal(catResult.success, true);
    if (catResult.success) assert.equal(catResult.data.categoryId, "cat-tech-ai");
  });
});

test("Step 2F: News Read API Endpoint & Persistence Integration", { skip: !isSupabaseConfigured }, async (t) => {
  await t.test("GET /api/news returns 200 with normalized articles and pagination", async () => {
    const req = new Request("http://localhost:3000/api/news");
    const response = await GET(req);

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.articles));
    assert.ok(body.pagination);
    assert.equal(body.pagination.limit, 20);
    assert.equal(typeof body.pagination.count, "number");
    assert.equal(body.pagination.count, body.articles.length);

    // Verify all required article fields exist on returned articles
    if (body.articles.length > 0) {
      const article = body.articles[0];
      assert.ok(article.id, "id must be present");
      assert.ok(article.title, "title must be present");
      assert.ok("description" in article, "description key must be present");
      assert.ok(article.url, "url must be present");
      assert.ok("imageUrl" in article, "imageUrl key must be present");
      assert.ok(article.source, "source must be present");
      assert.ok("sourceUrl" in article, "sourceUrl key must be present");
      assert.ok(article.publishedAt, "publishedAt must be present");
      assert.ok(article.fetchedAt, "fetchedAt must be present");
      assert.ok("language" in article, "language key must be present");
      assert.ok(article.provider, "provider must be present");

      // Verify ISO date string format
      assert.ok(!isNaN(Date.parse(article.publishedAt)));
      assert.ok(!isNaN(Date.parse(article.fetchedAt)));
    }
  });

  await t.test("GET /api/news?limit=2 enforces limit parameter", async () => {
    const req = new Request("http://localhost:3000/api/news?limit=2");
    const response = await GET(req);

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.success, true);
    assert.equal(body.pagination.limit, 2);
    assert.ok(body.articles.length <= 2);
  });

  await t.test("GET /api/news?provider=rss filters articles by provider", async () => {
    const req = new Request("http://localhost:3000/api/news?provider=rss");
    const response = await GET(req);

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.success, true);
    for (const article of body.articles) {
      assert.equal(article.provider, "rss");
    }
  });

  await t.test("GET /api/news?provider=gdelt filters articles by provider", async () => {
    const req = new Request("http://localhost:3000/api/news?provider=gdelt");
    const response = await GET(req);

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.success, true);
    for (const article of body.articles) {
      assert.equal(article.provider, "gdelt");
    }
  });

  await t.test("GET /api/news?categoryId=unknown-category returns empty list gracefully", async () => {
    const req = new Request("http://localhost:3000/api/news?categoryId=non-existent-cat");
    const response = await GET(req);

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.success, true);
    assert.deepEqual(body.articles, []);
    assert.equal(body.pagination.count, 0);
  });

  await t.test("GET /api/news with invalid limit returns 400 JSON", async () => {
    const req = new Request("http://localhost:3000/api/news?limit=999");
    const response = await GET(req);

    assert.equal(response.status, 400);
    const body = await response.json();

    assert.equal(body.success, false);
    assert.ok(body.error);
    assert.ok(body.details);
  });

  await t.test("GET /api/news with invalid provider returns 400 JSON", async () => {
    const req = new Request("http://localhost:3000/api/news?provider=unsupported");
    const response = await GET(req);

    assert.equal(response.status, 400);
    const body = await response.json();

    assert.equal(body.success, false);
    assert.ok(body.error);
    assert.ok(body.details);
  });

  await t.test("Persisted reader handles articles with null source_id safely", async () => {
    const supabase = getServiceSupabaseClient();
    const testExtId = "test-null-source-read-" + Date.now();

    // Insert article with source_id = null
    const { data: inserted, error: insertErr } = await supabase
      .from("articles")
      .insert({
        provider: "rss",
        external_id: testExtId,
        source_id: null,
        title: "Null Source Read Test",
        url: "https://example.com/null-source-read",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    assert.ok(!insertErr, `Insert should succeed: ${insertErr?.message}`);

    try {
      const result = await getPersistedArticles({ limit: 50, provider: "rss" });
      const found = result.articles.find((a) => a.id === inserted?.id);

      assert.ok(found, "Article with null source should be retrieved");
      assert.equal(found.source, "rss", "Source should fall back to provider name");
      assert.equal(found.sourceUrl, null, "Source URL should be null");
    } finally {
      // Clean up test article
      await supabase.from("articles").delete().eq("external_id", testExtId);
    }
  });
});
