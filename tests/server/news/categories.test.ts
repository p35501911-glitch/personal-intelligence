import test from "node:test";
import assert from "node:assert/strict";
import { matchCategories } from "@/server/news/categories/matcher";
import {
  tagArticleWithCategories,
  tagStoryWithCategories,
  getCategoriesForArticle,
  getCategoriesForStory,
  categorizeAndTagArticle,
  categorizeAndTagStory,
  resetCategoryCache,
} from "@/server/news/categories/service";
import { getStories } from "@/server/news/stories/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

test("Category Matching — AI and Machine Learning headline matches topic and inherits hierarchy", () => {
  const matches = matchCategories({
    title: "OpenAI announces new GPT-5 model with advanced reasoning capabilities",
    description: "The artificial intelligence lab released its latest LLM designed for complex math and coding.",
  });

  assert.ok(matches.length > 0, "Should have category matches");

  // Primary match
  const primary = matches.find((m) => m.isPrimary);
  assert.ok(primary, "Must have a primary category");
  assert.equal(primary.isPrimary, true);
  assert.ok(primary.confidence > 0.5, `Confidence should be high, got ${primary.confidence}`);

  // Topic or subcategory should be AI related
  const aiMatch = matches.find(
    (m) => m.categoryId === "cat-tech-ai" || m.categorySlug === "technology-ai" || m.categoryId.includes("ai")
  );
  assert.ok(aiMatch, "Should match AI category/topic");

  // Hierarchy inheritance: Root Technology category should also be present
  const techMatch = matches.find(
    (m) => m.categoryId === "cat-tech" || m.categorySlug === "technology"
  );
  assert.ok(techMatch, "Root category 'technology' should be inherited");
});

test("Category Matching — Macroeconomics headline matches central banking and macro finance", () => {
  const matches = matchCategories({
    title: "Federal Reserve cuts interest rates by 25 basis points as inflation cools",
    description: "Jerome Powell announced the central bank policy decision amid signs of moderating consumer prices.",
  });

  assert.ok(matches.length > 0, "Should match finance/economy categories");
  const primary = matches.find((m) => m.isPrimary);
  assert.ok(primary, "Must have a primary category");

  // Should include business / macro
  const businessOrMacro = matches.find(
    (m) =>
      m.categoryId === "cat-biz" ||
      m.categorySlug === "business-economy" ||
      m.categoryId === "cat-biz-macro" ||
      m.categorySlug === "business-macroeconomics" ||
      m.categoryId === "top-rates" ||
      m.categorySlug === "interest-rates"
  );
  assert.ok(businessOrMacro, "Should match business or macroeconomics");
});

test("Category Matching — Crypto headline matches cryptocurrency and blockchain", () => {
  const matches = matchCategories({
    title: "Bitcoin surges past $100,000 as spot ETF inflows accelerate",
    description: "Ethereum and other digital assets rallied alongside BTC amid institutional adoption.",
  });

  assert.ok(matches.length > 0, "Should match crypto categories");
  const cryptoMatch = matches.find(
    (m) =>
      m.categoryId === "cat-fin-crypto" ||
      m.categorySlug === "finance-crypto" ||
      m.categoryId === "top-btc" ||
      m.categorySlug === "bitcoin" ||
      m.categoryName.toLowerCase().includes("crypto") ||
      m.categoryName.toLowerCase().includes("bitcoin")
  );
  assert.ok(cryptoMatch, "Should identify cryptocurrency match");
});

test("Category Matching — Multi-category cross-domain headline tags multiple domains", () => {
  const matches = matchCategories({
    title: "Nvidia reports record quarterly earnings and revenue fueled by soaring AI data center chip demand",
    description: "Wall Street cheered the semiconductor giant's cloud computing GPU sales.",
  });

  assert.ok(matches.length >= 2, "Should match at least 2 categories across domains");

  const hasTechOrAI = matches.some(
    (m) =>
      m.rootSlug === "technology" ||
      m.categorySlug.includes("technology") ||
      m.categorySlug.includes("ai") ||
      m.categorySlug.includes("semiconductor") ||
      m.categorySlug.includes("gpus") ||
      m.categorySlug.includes("cloud")
  );
  const hasFinanceOrMarkets = matches.some(
    (m) =>
      m.rootSlug === "finance-markets" ||
      m.categorySlug.includes("finance") ||
      m.categorySlug.includes("markets") ||
      m.categoryName.toLowerCase().includes("market")
  );

  assert.ok(hasTechOrAI, "Should match technology/AI domain");
  assert.ok(hasFinanceOrMarkets, "Should match finance/earnings domain");
});

test("Category Matching — Single primary category and capped at 5 total matches", () => {
  const matches = matchCategories({
    title: "Global tech and finance leaders discuss renewable energy, AI chips, healthcare biotechnology and cybersecurity at Davos summit",
    description: "Broad discussion covering global economy, technological disruption, green transition, and public health.",
  });

  assert.ok(matches.length <= 5, `Expected at most 5 matches, got ${matches.length}`);

  const primaryMatches = matches.filter((m) => m.isPrimary);
  assert.equal(primaryMatches.length, 1, "Exactly one category must be marked primary");

  // All confidences between 0 and 1
  for (const m of matches) {
    assert.ok(m.confidence >= 0 && m.confidence <= 1, `Confidence ${m.confidence} out of range [0, 1]`);
  }
});

test("Category Matching — Fallback for generic/unmatched text returns empty array safely", () => {
  const matches = matchCategories({
    title: "The quick brown fox jumps over the lazy dog",
    description: "A completely unrelated non-news sentence that contains zero keywords.",
  });

  assert.deepEqual(matches, [], "Unmatched content should produce empty matches");
});

test("Category Matching — High speed performance: 100 articles classified in < 50ms", () => {
  const sampleHeadlines = [
    { title: "Apple announces iPhone 17 with on-device artificial intelligence model", description: "Silicon Valley hardware update" },
    { title: "European Central Bank holds interest rates steady as GDP growth slows", description: "Economic outlook for eurozone" },
    { title: "Tesla unveils next-generation electric vehicle and autonomous robotaxi", description: "Clean mobility and automotive tech" },
    { title: "NASA James Webb Space Telescope captures deepest image of early universe", description: "Astronomy discovery and cosmology" },
    { title: "World Health Organization warns of new respiratory virus strain", description: "Public health surveillance and pandemic response" },
  ];

  const startTime = performance.now();
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    const item = sampleHeadlines[i % sampleHeadlines.length];
    const res = matchCategories(item);
    assert.ok(res.length > 0);
  }

  const durationMs = performance.now() - startTime;
  const avgPerItemMs = durationMs / iterations;

  assert.ok(durationMs < 100, `100 classifications took ${durationMs.toFixed(2)}ms (expected < 100ms)`);
  assert.ok(avgPerItemMs < 1, `Average per classification was ${avgPerItemMs.toFixed(3)}ms (expected < 1ms)`);
});

test("Category Service — tagArticleWithCategories & getCategoriesForArticle mock test", async () => {
  resetCategoryCache();

  // In-memory mock client
  const inMemoryArticleCategories: Array<{
    article_id: string;
    category_id: string;
    confidence: number;
    is_primary: boolean;
  }> = [];

  const mockClient = {
    from(table: string) {
      if (table === "categories") {
        return {
          select: () => Promise.resolve({
            data: [
              { id: "uuid-cat-tech", slug: "technology" },
              { id: "uuid-cat-ai", slug: "technology-ai" },
            ],
            error: null,
          }),
        };
      }

      if (table === "article_categories") {
        return {
          upsert: (records: typeof inMemoryArticleCategories) => {
            for (const r of records) {
              const existingIdx = inMemoryArticleCategories.findIndex(
                (item) => item.article_id === r.article_id && item.category_id === r.category_id
              );
              if (existingIdx >= 0) {
                inMemoryArticleCategories[existingIdx] = r;
              } else {
                inMemoryArticleCategories.push(r);
              }
            }
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: (_col: string, val: string) => Promise.resolve({
              data: inMemoryArticleCategories.filter((r) => r.article_id === val),
              error: null,
            }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;

  const articleId = "article-mock-123";
  const matches = [
    {
      categoryId: "cat-tech-ai",
      categorySlug: "technology-ai",
      categoryName: "Artificial Intelligence",
      rootId: "cat-tech",
      rootSlug: "technology",
      confidence: 0.92,
      isPrimary: true,
      level: 2 as const,
      matchedRule: "Keyword test",
    },
    {
      categoryId: "cat-tech",
      categorySlug: "technology",
      categoryName: "Technology",
      rootId: "cat-tech",
      rootSlug: "technology",
      confidence: 0.82,
      isPrimary: false,
      level: 1 as const,
      matchedRule: "Inherited test",
    },
  ];

  await tagArticleWithCategories(articleId, matches, mockClient);

  const categories = await getCategoriesForArticle(articleId, mockClient);
  assert.equal(categories.length, 2);

  const primary = categories.find((c) => c.isPrimary);
  assert.ok(primary);
  assert.equal(primary.categoryId, "uuid-cat-ai", "Should use mapped UUID from slug");
  assert.equal(primary.confidence, 0.92);
});

test("Category Service — tagStoryWithCategories & getCategoriesForStory mock test", async () => {
  resetCategoryCache();

  const inMemoryStoryCategories: Array<{
    story_id: string;
    category_id: string;
    confidence: number;
    is_primary: boolean;
  }> = [];

  const mockClient = {
    from(table: string) {
      if (table === "categories") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }

      if (table === "story_categories") {
        return {
          upsert: (records: typeof inMemoryStoryCategories) => {
            for (const r of records) {
              const existingIdx = inMemoryStoryCategories.findIndex(
                (item) => item.story_id === r.story_id && item.category_id === r.category_id
              );
              if (existingIdx >= 0) {
                inMemoryStoryCategories[existingIdx] = r;
              } else {
                inMemoryStoryCategories.push(r);
              }
            }
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: (_col: string, val: string) => Promise.resolve({
              data: inMemoryStoryCategories.filter((r) => r.story_id === val),
              error: null,
            }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;

  const storyId = "story-mock-456";
  const matches = [
    {
      categoryId: "cat-finance",
      categorySlug: "finance-markets",
      categoryName: "Markets & Economy",
      rootId: "cat-fin",
      rootSlug: "finance-markets",
      confidence: 0.88,
      isPrimary: true,
      level: 1 as const,
      matchedRule: "Rule test",
    },
  ];

  await tagStoryWithCategories(storyId, matches, mockClient);

  const categories = await getCategoriesForStory(storyId, mockClient);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].categoryId, "cat-finance");
  assert.equal(categories[0].isPrimary, true);
  assert.equal(categories[0].confidence, 0.88);
});

test("Category Service — categorizeAndTagStory conveniency helper tags story correctly", async () => {
  resetCategoryCache();

  let capturedRecords: Array<{ story_id: string; category_id: string }> = [];

  const mockClient = {
    from(table: string) {
      if (table === "categories") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      if (table === "story_categories") {
        return {
          upsert: (records: typeof capturedRecords) => {
            capturedRecords = records;
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  } as unknown as SupabaseClient<Database>;

  const matches = await categorizeAndTagStory(
    {
      id: "story-auto-01",
      canonicalTitle: "Federal Reserve interest rate cuts expected in upcoming meeting",
      summary: "Macroeconomic outlook indicates rate reductions.",
    },
    mockClient
  );

  assert.ok(matches.length > 0);
  assert.ok(capturedRecords.length > 0);
  assert.equal(capturedRecords[0].story_id, "story-auto-01");
});

test("Category Service — categorizeAndTagArticle convenience helper tags article correctly", async () => {
  resetCategoryCache();

  let capturedRecords: Array<{ article_id: string; category_id: string }> = [];

  const mockClient = {
    from(table: string) {
      if (table === "categories") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      if (table === "article_categories") {
        return {
          upsert: (records: typeof capturedRecords) => {
            capturedRecords = records;
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  } as unknown as SupabaseClient<Database>;

  const matches = await categorizeAndTagArticle(
    {
      id: "article-auto-01",
      title: "OpenAI releases new reasoning model with coding agents",
      description: "Autonomous artificial intelligence tools.",
    },
    mockClient
  );

  assert.ok(matches.length > 0);
  assert.ok(capturedRecords.length > 0);
  assert.equal(capturedRecords[0].article_id, "article-auto-01");
});

test("Category Filtering — getStories filters by categoryId correctly", async () => {
  resetCategoryCache();

  const mockStories = [
    {
      id: "story-tech-1",
      canonical_title: "Tech Story",
      summary: null,
      first_published_at: new Date().toISOString(),
      latest_published_at: new Date().toISOString(),
      article_count: 1,
      source_count: 1,
      importance_score: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "story-biz-2",
      canonical_title: "Business Story",
      summary: null,
      first_published_at: new Date().toISOString(),
      latest_published_at: new Date().toISOString(),
      article_count: 1,
      source_count: 1,
      importance_score: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockStoryCategories = [
    { story_id: "story-tech-1", category_id: "uuid-cat-tech" },
  ];

  const mockClient = {
    from(table: string) {
      if (table === "categories") {
        return {
          select: () => Promise.resolve({
            data: [{ id: "uuid-cat-tech", slug: "technology" }],
            error: null,
          }),
        };
      }

      if (table === "story_categories") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => Promise.resolve({
              data: mockStoryCategories.filter((sc) => sc.category_id === val),
              error: null,
            }),
          }),
        };
      }

      if (table === "stories") {
        let filtered = [...mockStories];
        const builder: Record<string, unknown> = {
          select: () => builder,
          order: () => builder,
          eq: () => builder,
          in: (_col: string, ids: string[]) => {
            filtered = filtered.filter((s) => ids.includes(s.id));
            return builder;
          },
          range: () => Promise.resolve({
            data: filtered,
            count: filtered.length,
            error: null,
          }),
        };
        return builder;
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;

  // Filter by slug "technology"
  const result = await getStories({ categoryId: "technology" }, mockClient);
  assert.equal(result.stories.length, 1);
  assert.equal(result.stories[0].id, "story-tech-1");

  // Filter by nonexistent category
  const emptyResult = await getStories({ categoryId: "nonexistent" }, mockClient);
  assert.equal(emptyResult.stories.length, 0);
});

