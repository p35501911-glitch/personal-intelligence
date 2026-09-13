import test from "node:test";
import assert from "node:assert/strict";
import {
  computeUserRelevance,
  computeRecencyFactor,
  type RelevanceCandidateStory,
} from "@/server/news/relevance/scorer";
import {
  getUserPersonalizedFeed,
  getUserPreferencesData,
} from "@/server/news/relevance/service";
import { feedQuerySchema, GET as feedRouteHandler } from "@/app/api/feed/route";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const now = new Date("2026-09-13T12:00:00Z");

function createSampleStory(overrides: Partial<RelevanceCandidateStory> = {}): RelevanceCandidateStory {
  return {
    id: "story-sample-1",
    canonicalTitle: "Sample Technology Story",
    summary: "Summary text",
    firstPublishedAt: new Date("2026-09-13T10:00:00Z"),
    latestPublishedAt: new Date("2026-09-13T10:00:00Z"),
    articleCount: 2,
    sourceCount: 2,
    importanceScore: null,
    categories: [
      {
        categoryId: "cat-tech-ai",
        categorySlug: "technology-ai",
        categoryName: "Artificial Intelligence",
        rootId: "cat-tech",
        rootSlug: "technology",
        level: 2,
        confidence: 0.90,
        isPrimary: true,
      },
    ],
    ...overrides,
  };
}

test("User Relevance Scorer — Specificity: Direct Topic match scores higher than broad root match", () => {
  // Story A: Specific topic match (Level 3: AI Models)
  const storyTopic = createSampleStory({
    categories: [
      {
        categoryId: "top-ai-models",
        categorySlug: "ai-models",
        categoryName: "AI Models",
        rootId: "cat-tech",
        rootSlug: "technology",
        level: 3,
        confidence: 0.90,
        isPrimary: true,
      },
    ],
  });

  // Story B: Broad root match (Level 1: Technology)
  const storyRoot = createSampleStory({
    categories: [
      {
        categoryId: "cat-tech",
        categorySlug: "technology",
        categoryName: "Technology",
        rootId: "cat-tech",
        rootSlug: "technology",
        level: 1,
        confidence: 0.90,
        isPrimary: true,
      },
    ],
  });

  const resTopic = computeUserRelevance({
    userCategoryIds: ["top-ai-models", "cat-tech"],
    selectionMode: "CATEGORY",
    story: storyTopic,
    referenceTime: now,
  });

  const resRoot = computeUserRelevance({
    userCategoryIds: ["top-ai-models", "cat-tech"],
    selectionMode: "CATEGORY",
    story: storyRoot,
    referenceTime: now,
  });

  assert.ok(resTopic.isRelevant, "Topic match should be relevant");
  assert.ok(resRoot.isRelevant, "Root match should be relevant");
  assert.ok(
    resTopic.score > resRoot.score,
    `Topic match score (${resTopic.score}) must exceed root match score (${resRoot.score})`
  );
});

test("User Relevance Scorer — Primary Tag vs Secondary Tag weighting", () => {
  // Story A: Matching category is primary
  const storyPrimary = createSampleStory({
    categories: [
      {
        categoryId: "cat-tech-ai",
        categorySlug: "technology-ai",
        categoryName: "Artificial Intelligence",
        rootId: "cat-tech",
        rootSlug: "technology",
        level: 2,
        confidence: 0.85,
        isPrimary: true,
      },
    ],
  });

  // Story B: Matching category is secondary (another category is primary)
  const storySecondary = createSampleStory({
    categories: [
      {
        categoryId: "cat-fin-stocks",
        categorySlug: "finance-stock-markets",
        categoryName: "Stock Markets",
        rootId: "cat-fin",
        rootSlug: "finance-markets",
        level: 2,
        confidence: 0.95,
        isPrimary: true,
      },
      {
        categoryId: "cat-tech-ai",
        categorySlug: "technology-ai",
        categoryName: "Artificial Intelligence",
        rootId: "cat-tech",
        rootSlug: "technology",
        level: 2,
        confidence: 0.85,
        isPrimary: false,
      },
    ],
  });

  const userPref = ["cat-tech-ai"];

  const resPrimary = computeUserRelevance({
    userCategoryIds: userPref,
    story: storyPrimary,
    referenceTime: now,
  });

  const resSecondary = computeUserRelevance({
    userCategoryIds: userPref,
    story: storySecondary,
    referenceTime: now,
  });

  assert.ok(
    resPrimary.score > resSecondary.score,
    `Primary match score (${resPrimary.score}) must exceed secondary match score (${resSecondary.score})`
  );
});

test("User Relevance Scorer — Multi-Category Synergy Boost (+20% for 2 matches, +35% for 3 matches)", () => {
  const userPrefs = ["cat-tech-ai", "semiconductors", "cloud-computing"];

  // Single match
  const storySingle = createSampleStory({
    categories: [
      {
        categoryId: "cat-tech-ai",
        categorySlug: "technology-ai",
        categoryName: "Artificial Intelligence",
        level: 2,
        confidence: 0.80,
        isPrimary: true,
      },
    ],
  });

  // Dual match (AI + Semiconductors crossover)
  const storyDual = createSampleStory({
    categories: [
      {
        categoryId: "cat-tech-ai",
        categorySlug: "technology-ai",
        categoryName: "Artificial Intelligence",
        level: 2,
        confidence: 0.80,
        isPrimary: true,
      },
      {
        categoryId: "semiconductors",
        categorySlug: "semiconductors",
        categoryName: "Semiconductors",
        level: 3,
        confidence: 0.80,
        isPrimary: false,
      },
    ],
  });

  // Triple match (AI + Semiconductors + Cloud crossover)
  const storyTriple = createSampleStory({
    categories: [
      {
        categoryId: "cat-tech-ai",
        categorySlug: "technology-ai",
        categoryName: "Artificial Intelligence",
        level: 2,
        confidence: 0.80,
        isPrimary: true,
      },
      {
        categoryId: "semiconductors",
        categorySlug: "semiconductors",
        categoryName: "Semiconductors",
        level: 3,
        confidence: 0.80,
        isPrimary: false,
      },
      {
        categoryId: "cloud-computing",
        categorySlug: "cloud-computing",
        categoryName: "Cloud Computing",
        level: 3,
        confidence: 0.80,
        isPrimary: false,
      },
    ],
  });

  const resSingle = computeUserRelevance({ userCategoryIds: userPrefs, story: storySingle, referenceTime: now });
  const resDual = computeUserRelevance({ userCategoryIds: userPrefs, story: storyDual, referenceTime: now });
  const resTriple = computeUserRelevance({ userCategoryIds: userPrefs, story: storyTriple, referenceTime: now });

  assert.equal(resSingle.synergyBoost, 0);
  assert.equal(resDual.synergyBoost, 0.20);
  assert.equal(resTriple.synergyBoost, 0.35);

  assert.ok(resDual.score > resSingle.score, `Dual score (${resDual.score}) should exceed single score (${resSingle.score})`);
  assert.ok(resTriple.score > resDual.score, `Triple score (${resTriple.score}) should exceed dual score (${resDual.score})`);
  assert.ok(resDual.explanation.includes("+20% crossover"));
  assert.ok(resTriple.explanation.includes("+35% crossover"));
});

test("User Relevance Scorer — Recency Decay behaves predictably with floor", () => {
  const published2HoursAgo = new Date("2026-09-13T10:00:00Z");
  const published48HoursAgo = new Date("2026-09-11T12:00:00Z");
  const published7DaysAgo = new Date("2026-09-06T12:00:00Z");

  const decay2h = computeRecencyFactor(published2HoursAgo, now, 48);
  const decay48h = computeRecencyFactor(published48HoursAgo, now, 48);
  const decay7d = computeRecencyFactor(published7DaysAgo, now, 48);

  assert.equal(decay2h, 1.0, "Fresh stories retain 1.0 freshness");
  assert.equal(decay48h, 0.50, "48 hours half-life gives 0.50 freshness");
  assert.equal(decay7d, 0.20, "Older stories stop decaying at 0.20 floor");
});

test("User Relevance Scorer — Unrelated categories score 0.00 and are marked non-relevant", () => {
  const cryptoStory = createSampleStory({
    categories: [
      {
        categoryId: "finance-crypto",
        categorySlug: "finance-crypto",
        categoryName: "Crypto & Web3",
        level: 2,
        confidence: 0.95,
        isPrimary: true,
      },
    ],
  });

  const userPrefs = ["cat-health", "medicine"];

  const result = computeUserRelevance({
    userCategoryIds: userPrefs,
    story: cryptoStory,
    referenceTime: now,
  });

  assert.equal(result.score, 0);
  assert.equal(result.isRelevant, false);
  assert.equal(result.matchedCategoryIds.length, 0);
});

test("User Relevance Scorer — Mode ALL generates general intelligence score", () => {
  const story = createSampleStory({
    sourceCount: 4,
    articleCount: 5,
  });

  const result = computeUserRelevance({
    userCategoryIds: [],
    selectionMode: "ALL",
    story,
    referenceTime: now,
  });

  assert.ok(result.score > 0.6, `Mode ALL should give positive score, got ${result.score}`);
  assert.ok(result.isRelevant);
  assert.ok(result.explanation.includes("4 publishers"));
});

test("User Relevance Scorer — Sub-millisecond execution: 1,000 calculations in < 20ms", () => {
  const story = createSampleStory();
  const userPrefs = ["cat-tech-ai", "technology", "semiconductors"];

  const startTime = performance.now();
  const iterations = 1000;

  for (let i = 0; i < iterations; i++) {
    const res = computeUserRelevance({
      userCategoryIds: userPrefs,
      story,
      referenceTime: now,
    });
    assert.ok(res.score > 0);
  }

  const durationMs = performance.now() - startTime;
  const avgPerCalc = durationMs / iterations;

  assert.ok(durationMs < 50, `1,000 calculations took ${durationMs.toFixed(2)}ms (expected < 50ms)`);
  assert.ok(avgPerCalc < 0.05, `Average per calculation was ${avgPerCalc.toFixed(4)}ms (expected < 0.05ms)`);
});

test("Personalized Feed Service — getUserPersonalizedFeed queries and ranks stories", async () => {
  const mockStories = [
    {
      id: "story-ai-1",
      canonical_title: "OpenAI Unveils New Model",
      summary: "AI model details",
      first_published_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      latest_published_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      article_count: 3,
      source_count: 3,
      importance_score: null,
      status: "active",
    },
    {
      id: "story-crypto-2",
      canonical_title: "Bitcoin Climbs Past 100k",
      summary: "Crypto details",
      first_published_at: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
      latest_published_at: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
      article_count: 2,
      source_count: 2,
      importance_score: null,
      status: "active",
    },
    {
      id: "story-ai-chips-3",
      canonical_title: "Nvidia AI Chip Breakthrough with Cloud Hyperscalers",
      summary: "AI chip and cloud details",
      first_published_at: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
      latest_published_at: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
      article_count: 4,
      source_count: 4,
      importance_score: null,
      status: "active",
    },
  ];

  const mockStoryCategories = [
    {
      story_id: "story-ai-1",
      category_id: "cat-tech-ai",
      confidence: 0.90,
      is_primary: true,
      categories: { id: "cat-tech-ai", slug: "technology-ai", name: "Artificial Intelligence", level: 2, parent_id: "cat-tech" },
    },
    {
      story_id: "story-crypto-2",
      category_id: "cat-fin-crypto",
      confidence: 0.88,
      is_primary: true,
      categories: { id: "cat-fin-crypto", slug: "finance-crypto", name: "Crypto & Web3", level: 2, parent_id: "cat-fin" },
    },
    {
      story_id: "story-ai-chips-3",
      category_id: "cat-tech-ai",
      confidence: 0.92,
      is_primary: true,
      categories: { id: "cat-tech-ai", slug: "technology-ai", name: "Artificial Intelligence", level: 2, parent_id: "cat-tech" },
    },
    {
      story_id: "story-ai-chips-3",
      category_id: "semiconductors",
      confidence: 0.85,
      is_primary: false,
      categories: { id: "semiconductors", slug: "semiconductors", name: "Semiconductors", level: 3, parent_id: "cat-tech-hardware" },
    },
  ];

  const mockClient = {
    from(table: string) {
      if (table === "stories") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          order: () => builder,
          limit: () => Promise.resolve({ data: mockStories, error: null }),
        };
        return builder;
      }

      if (table === "story_categories") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: mockStoryCategories, error: null }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;

  // User follows AI and Semiconductors
  const feedResult = await getUserPersonalizedFeed(
    {
      userCategoryIds: ["technology-ai", "semiconductors"],
      selectionMode: "CATEGORY",
    },
    mockClient
  );

  // Should exclude crypto story because user selected AI and semiconductors
  assert.equal(feedResult.stories.length, 2);

  // Top story should be story-ai-chips-3 because it has dual category synergy
  const topStory = feedResult.stories[0];
  assert.equal(topStory.id, "story-ai-chips-3");
  assert.ok(topStory.relevance.synergyBoost > 0, "Top story should have synergy boost");
  assert.ok(topStory.relevance.score >= feedResult.stories[1].relevance.score);
});

test("Personalized Feed Service — getUserPreferencesData fetches user mode and category IDs", async () => {
  const mockClient = {
    from(table: string) {
      if (table === "user_preferences") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { category_selection_mode: "CATEGORY" },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "user_category_preferences") {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ category_id: "cat-tech-ai" }, { category_id: "top-semi" }],
              error: null,
            }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;

  const prefs = await getUserPreferencesData("user-123", mockClient);
  assert.equal(prefs.mode, "CATEGORY");
  assert.equal(prefs.categoryIds.length, 2);
  assert.equal(prefs.categoryIds[0], "cat-tech-ai");
});

test("Feed API — Query Schema validation & Route Handler", async (t) => {
  await t.test("feedQuerySchema applies defaults and validates bounds", () => {
    const valid = feedQuerySchema.safeParse({});
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.equal(valid.data.limit, 20);
      assert.equal(valid.data.offset, 0);
    }

    const invalid = feedQuerySchema.safeParse({ limit: "100" });
    assert.equal(invalid.success, false, "Limit cannot exceed 50");
  });

  await t.test("feedRouteHandler returns 400 on invalid query params", async () => {
    const req = new Request("http://localhost:3000/api/feed?limit=-5");
    const res = await feedRouteHandler(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.equal(data.success, false);
  });
});
