import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getUserPersonalizedFeed, getUserPreferencesData } from "@/server/news/relevance/service";
import { computeUserRelevance, type StoryCategoryTag, type RelevanceCandidateStory } from "@/server/news/relevance/scorer";
import { feedQuerySchema } from "@/app/api/feed/route";
import { isValidTaxonomySlug } from "@/server/ai/classifier";
import { getCategorySlugToIdMap, resetCategoryCache } from "@/server/news/categories/service";

// Canonical test stories
const TEST_STORIES = [
  {
    id: "story-topic-ai",
    canonical_title: "DeepSeek and OpenAI Announce Frontier Reasoning Benchmarks",
    summary: "New frontier AI models demonstrate advanced logic and code generation.",
    first_published_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    article_count: 6,
    source_count: 5,
    importance_score: 0.88,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-hardware-chips",
    canonical_title: "TSMC Reveals 2nm Packaging Breakthrough with Nvidia",
    summary: "Next-generation semiconductor foundries achieve higher transistor density.",
    first_published_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    article_count: 4,
    source_count: 3,
    importance_score: 0.74,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-cross-synergy",
    canonical_title: "AI Accelerators Revolutionize Cloud Data Centers and Chip Design",
    summary: "Semiconductor firms integrate autonomous AI agents to optimize lithography.",
    first_published_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    article_count: 7,
    source_count: 5,
    importance_score: 0.92,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-global-health",
    canonical_title: "Global Health Organization Issues Universal Vaccine Guidance",
    summary: "International regulatory bodies approve preventative oncology trial.",
    first_published_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    article_count: 3,
    source_count: 2,
    importance_score: 0.65,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const TEST_STORY_CATEGORIES = [
  // story-topic-ai: Level 3 Topic "ai-models" (parent "technology-ai", root "technology")
  {
    story_id: "story-topic-ai",
    category_id: "ai-models",
    confidence: 0.95,
    is_primary: true,
    categories: {
      id: "ai-models",
      name: "AI Models & LLMs",
      slug: "ai-models",
      level: 3,
      parent_id: "technology-ai",
    },
  },
  // story-hardware-chips: Level 3 Topic "semiconductors" (parent "technology-hardware", root "technology")
  {
    story_id: "story-hardware-chips",
    category_id: "semiconductors",
    confidence: 0.90,
    is_primary: true,
    categories: {
      id: "semiconductors",
      name: "Semiconductors & Chips",
      slug: "semiconductors",
      level: 3,
      parent_id: "technology-hardware",
    },
  },
  // story-cross-synergy: matches BOTH "ai-models" AND "semiconductors" (synergy crossover)
  {
    story_id: "story-cross-synergy",
    category_id: "ai-models",
    confidence: 0.92,
    is_primary: true,
    categories: {
      id: "ai-models",
      name: "AI Models & LLMs",
      slug: "ai-models",
      level: 3,
      parent_id: "technology-ai",
    },
  },
  {
    story_id: "story-cross-synergy",
    category_id: "semiconductors",
    confidence: 0.88,
    is_primary: false,
    categories: {
      id: "semiconductors",
      name: "Semiconductors & Chips",
      slug: "semiconductors",
      level: 3,
      parent_id: "technology-hardware",
    },
  },
  // story-global-health: Level 1 Root "health-medicine"
  {
    story_id: "story-global-health",
    category_id: "health-medicine",
    confidence: 0.90,
    is_primary: true,
    categories: {
      id: "health-medicine",
      name: "Health & Medicine",
      slug: "health-medicine",
      level: 1,
      parent_id: null,
    },
  },
];

function createMockPersonalizationSupabase(options?: {
  userCategoryIds?: string[];
  selectionMode?: "CATEGORY" | "ALL";
}) {
  const userMode = options?.selectionMode || "CATEGORY";
  const userCats = options?.userCategoryIds || [];

  return {
    from(table: string) {
      if (table === "user_preferences") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { category_selection_mode: userMode },
                  error: null,
                }),
            }),
          }),
        };
      }

      if (table === "user_category_preferences") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: userCats.map((id) => ({
                  category_id: id,
                  categories: {
                    id,
                    slug: id,
                    name: id,
                  },
                })),
                error: null,
              }),
          }),
        };
      }

      if (table === "stories") {
        return {
          select: () => {
            const builder = {
              eq: () => builder,
              gte: () => builder,
              order: () => builder,
              limit: () => Promise.resolve({ data: TEST_STORIES, error: null }),
            };
            return builder;
          },
        };
      }

      if (table === "story_categories") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: TEST_STORY_CATEGORIES, error: null }),
          }),
        };
      }

      if (table === "categories") {
        return {
          select: () =>
            Promise.resolve({
              data: [
                { id: "uuid-ai-models", slug: "ai-models" },
                { id: "uuid-tech-ai", slug: "technology-ai" },
                { id: "uuid-tech", slug: "technology" },
                { id: "uuid-semiconductors", slug: "semiconductors" },
                { id: "uuid-health", slug: "health-medicine" },
              ],
              error: null,
            }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;
}

test("User Category Preference Personalization & AI Category Integration Suite", async (t) => {
  // Test 1: User category preference filtering in CATEGORY mode
  await t.test("1. User category preference filtering returns only matching stories", async () => {
    const mockClient = createMockPersonalizationSupabase({
      userCategoryIds: ["ai-models"],
      selectionMode: "CATEGORY",
    });

    const result = await getUserPersonalizedFeed(
      {
        userId: "user-test-1",
        selectionMode: "CATEGORY",
      },
      mockClient
    );

    assert.equal(result.mode, "CATEGORY");
    assert.ok(result.stories.length >= 1);
    // Must contain AI stories, but NOT the health story
    const hasAIStory = result.stories.some((s) => s.id === "story-topic-ai");
    const hasHealthStory = result.stories.some((s) => s.id === "story-global-health");
    assert.equal(hasAIStory, true, "AI story must be in personalized feed");
    assert.equal(hasHealthStory, false, "Health story must not appear in AI-only feed");
  });

  // Test 2: Direct Topic match scores higher than broad Root Category match
  await t.test("2. Direct topic match (Level 3) specificity scores higher than root category (Level 1)", () => {
    const topicTag: StoryCategoryTag = {
      categoryId: "ai-models",
      categorySlug: "ai-models",
      categoryName: "AI Models & LLMs",
      rootId: "technology",
      rootSlug: "technology",
      parentId: "technology-ai",
      parentSlug: "technology-ai",
      level: 3,
      confidence: 0.95,
      isPrimary: true,
    };

    const rootTag: StoryCategoryTag = {
      categoryId: "technology",
      categorySlug: "technology",
      categoryName: "Technology",
      rootId: "technology",
      rootSlug: "technology",
      parentId: null,
      parentSlug: null,
      level: 1,
      confidence: 0.95,
      isPrimary: true,
    };

    const dummyStory = (tag: StoryCategoryTag): RelevanceCandidateStory => ({
      id: "s1",
      canonicalTitle: "Test Story",
      firstPublishedAt: new Date(),
      latestPublishedAt: new Date(),
      articleCount: 3,
      sourceCount: 3,
      importanceScore: 0.8,
      categories: [tag],
    });

    // User selected specific topic "ai-models"
    const topicResult = computeUserRelevance({
      userCategoryIds: ["ai-models"],
      selectionMode: "CATEGORY",
      story: dummyStory(topicTag),
    });

    // User selected broad root "technology"
    const rootResult = computeUserRelevance({
      userCategoryIds: ["technology"],
      selectionMode: "CATEGORY",
      story: dummyStory(rootTag),
    });

    assert.ok(topicResult.score > rootResult.score, `Topic score (${topicResult.score}) must exceed root score (${rootResult.score})`);
  });

  // Test 3: Parent/subcategory hierarchy matching
  await t.test("3. Parent subcategory match: user selects subcategory, matches child topic stories", () => {
    const story: RelevanceCandidateStory = {
      id: "story-topic-ai",
      canonicalTitle: "New AI Architecture",
      firstPublishedAt: new Date(),
      latestPublishedAt: new Date(),
      articleCount: 3,
      sourceCount: 3,
      categories: [
        {
          categoryId: "ai-models",
          categorySlug: "ai-models",
          categoryName: "AI Models",
          rootId: "technology",
          rootSlug: "technology",
          parentId: "technology-ai",
          parentSlug: "technology-ai",
          level: 3,
          confidence: 0.90,
          isPrimary: true,
        },
      ],
    };

    // User selected parent subcategory "technology-ai"
    const result = computeUserRelevance({
      userCategoryIds: ["technology-ai"],
      selectionMode: "CATEGORY",
      story,
    });

    assert.equal(result.isRelevant, true, "Parent match must be recognized as relevant");
    assert.ok(result.score > 0.5, `Score should be significant, got ${result.score}`);
    assert.ok(result.explanation.includes("AI Models"));
  });

  // Test 4: Root category hierarchy matching
  await t.test("4. Root category match: user selects root category, matches child topic stories", () => {
    const story: RelevanceCandidateStory = {
      id: "story-topic-ai",
      canonicalTitle: "New AI Architecture",
      firstPublishedAt: new Date(),
      latestPublishedAt: new Date(),
      articleCount: 3,
      sourceCount: 3,
      categories: [
        {
          categoryId: "ai-models",
          categorySlug: "ai-models",
          categoryName: "AI Models",
          rootId: "technology",
          rootSlug: "technology",
          parentId: "technology-ai",
          parentSlug: "technology-ai",
          level: 3,
          confidence: 0.90,
          isPrimary: true,
        },
      ],
    };

    // User selected root "technology"
    const result = computeUserRelevance({
      userCategoryIds: ["technology"],
      selectionMode: "CATEGORY",
      story,
    });

    assert.equal(result.isRelevant, true, "Root category match must be recognized as relevant");
    assert.ok(result.score > 0.4, `Score should be positive, got ${result.score}`);
  });

  // Test 5: Empty user preferences returns 0 stories in CATEGORY mode
  await t.test("5. Empty preferences in CATEGORY mode returns 0 stories (no accidental global wire leak)", async () => {
    const mockClient = createMockPersonalizationSupabase({
      userCategoryIds: [],
      selectionMode: "CATEGORY",
    });

    const result = await getUserPersonalizedFeed(
      {
        userId: "user-empty-prefs",
        selectionMode: "CATEGORY",
      },
      mockClient
    );

    assert.equal(result.mode, "CATEGORY");
    assert.equal(result.stories.length, 0, "Feed must be empty when user has selected 0 categories");
    assert.equal(result.count, 0);
    assert.equal(result.userCategoryCount, 0);
  });

  // Test 6: ALL mode ignores user preferences and returns globally important stories
  await t.test("6. ALL mode ignores user preferences and returns global stories across categories", async () => {
    const mockClient = createMockPersonalizationSupabase({
      userCategoryIds: ["ai-models"], // User prefers AI, but asks for ALL mode
      selectionMode: "ALL",
    });

    const result = await getUserPersonalizedFeed(
      {
        userId: "user-test-1",
        selectionMode: "ALL",
      },
      mockClient
    );

    assert.equal(result.mode, "ALL");
    assert.equal(result.stories.length, 4, "ALL mode must return all eligible candidate stories");
    const healthStory = result.stories.find((s) => s.id === "story-global-health");
    assert.ok(healthStory, "Health story must be present in ALL mode");
  });

  // Test 7: AI category slug to database UUID mapping
  await t.test("7. AI category slug maps to real database category ID", async () => {
    resetCategoryCache();
    const mockClient = createMockPersonalizationSupabase();
    const slugMap = await getCategorySlugToIdMap(mockClient);

    assert.equal(slugMap.get("ai-models"), "uuid-ai-models");
    assert.equal(slugMap.get("technology"), "uuid-tech");
    assert.equal(slugMap.get("semiconductors"), "uuid-semiconductors");
  });

  // Test 8: Invalid AI category handling
  await t.test("8. Invalid AI category slugs are safely detected and rejected", () => {
    assert.equal(isValidTaxonomySlug("ai-models"), true, "Canonical slug must be valid");
    assert.equal(isValidTaxonomySlug("technology-ai"), true, "Canonical subcategory must be valid");
    assert.equal(isValidTaxonomySlug("health-medicine"), true, "Canonical root must be valid");

    assert.equal(isValidTaxonomySlug("crypto-laser-moon"), false, "Hallucinated slug must be invalid");
    assert.equal(isValidTaxonomySlug("not-a-real-category"), false, "Unknown slug must be invalid");
    assert.equal(isValidTaxonomySlug(""), false, "Empty slug must be invalid");
  });

  // Test 9: Multi-category synergy boost
  await t.test("9. Multi-category synergy boosts stories with crossover interest overlap", () => {
    const singleMatchStory: RelevanceCandidateStory = {
      id: "s-single",
      canonicalTitle: "AI Solo Story",
      firstPublishedAt: new Date(),
      latestPublishedAt: new Date(),
      articleCount: 3,
      sourceCount: 3,
      categories: [
        {
          categoryId: "ai-models",
          categorySlug: "ai-models",
          categoryName: "AI Models",
          level: 3,
          confidence: 0.90,
          isPrimary: true,
        },
      ],
    };

    const dualMatchStory: RelevanceCandidateStory = {
      id: "s-dual",
      canonicalTitle: "AI and Semiconductors Crossover Story",
      firstPublishedAt: new Date(),
      latestPublishedAt: new Date(),
      articleCount: 3,
      sourceCount: 3,
      categories: [
        {
          categoryId: "ai-models",
          categorySlug: "ai-models",
          categoryName: "AI Models",
          level: 3,
          confidence: 0.90,
          isPrimary: true,
        },
        {
          categoryId: "semiconductors",
          categorySlug: "semiconductors",
          categoryName: "Semiconductors & Chips",
          level: 3,
          confidence: 0.90,
          isPrimary: false,
        },
      ],
    };

    // User selected both categories
    const userCats = ["ai-models", "semiconductors"];
    const resSingle = computeUserRelevance({
      userCategoryIds: userCats,
      selectionMode: "CATEGORY",
      story: singleMatchStory,
    });

    const resDual = computeUserRelevance({
      userCategoryIds: userCats,
      selectionMode: "CATEGORY",
      story: dualMatchStory,
    });

    assert.equal(resSingle.synergyBoost, 0, "Single match has 0 synergy boost");
    assert.equal(resDual.synergyBoost, 0.20, "Dual match receives 20% synergy boost");
    assert.ok(resDual.score > resSingle.score, `Dual match score (${resDual.score}) must exceed single match (${resSingle.score})`);
  });

  // Test 10: Personalized feed pagination
  await t.test("10. Personalized feed respects pagination limit and offset", async () => {
    const mockClient = createMockPersonalizationSupabase({
      userCategoryIds: ["ai-models", "semiconductors"],
      selectionMode: "CATEGORY",
    });

    // Page 1: limit 1, offset 0
    const page1 = await getUserPersonalizedFeed(
      {
        userId: "user-test-1",
        selectionMode: "CATEGORY",
        limit: 1,
        offset: 0,
      },
      mockClient
    );

    assert.equal(page1.stories.length, 1);
    assert.equal(page1.hasMore, true);

    // Page 2: limit 1, offset 1
    const page2 = await getUserPersonalizedFeed(
      {
        userId: "user-test-1",
        selectionMode: "CATEGORY",
        limit: 1,
        offset: 1,
      },
      mockClient
    );

    assert.equal(page2.stories.length, 1);
    assert.notEqual(page1.stories[0].id, page2.stories[0].id, "Page 2 story must differ from Page 1");
  });

  // Test 11: Security: arbitrary userId in query parameter is rejected
  await t.test("11. Client cannot supply arbitrary userId query parameter", () => {
    const parsed = feedQuerySchema.safeParse({
      mode: "CATEGORY",
      userId: "malicious-user-id-to-leak",
    });

    assert.equal(parsed.success, true);
    // @ts-expect-error verifying userId is completely discarded
    assert.equal(parsed.data.userId, undefined);
  });

  // Test 12: mode="topics" and mode="all" query alias handling
  await t.test("12. feedQuerySchema normalizes 'topics' -> 'CATEGORY' and 'all' -> 'ALL'", () => {
    const parsedTopics = feedQuerySchema.safeParse({ mode: "topics" });
    assert.equal(parsedTopics.success, true);
    assert.equal(parsedTopics.data?.mode, "CATEGORY");

    const parsedCategory = feedQuerySchema.safeParse({ mode: "category" });
    assert.equal(parsedCategory.success, true);
    assert.equal(parsedCategory.data?.mode, "CATEGORY");

    const parsedAll = feedQuerySchema.safeParse({ mode: "all" });
    assert.equal(parsedAll.success, true);
    assert.equal(parsedAll.data?.mode, "ALL");

    const parsedInvalid = feedQuerySchema.safeParse({ mode: "unsupported" });
    assert.equal(parsedInvalid.success, false);
  });

  // Test 13: getUserPreferencesData retrieves saved user category IDs accurately
  await t.test("13. getUserPreferencesData retrieves saved user category IDs accurately", async () => {
    const mockClient = createMockPersonalizationSupabase({
      userCategoryIds: ["ai-models"],
      selectionMode: "CATEGORY",
    });

    const prefs = await getUserPreferencesData("user-test-1", mockClient);
    assert.equal(prefs.mode, "CATEGORY");
    assert.equal(prefs.categoryIds.length, 1);
    assert.equal(prefs.categoryIds[0], "ai-models");

    // Verify getUserPersonalizedFeed matches stories when user selected seed ID "top-ai-models"
    const mockClientWithSeedId = createMockPersonalizationSupabase({
      userCategoryIds: ["top-ai-models"],
      selectionMode: "CATEGORY",
    });
    const feedWithSeed = await getUserPersonalizedFeed(
      {
        userId: "user-seed-test",
        selectionMode: "CATEGORY",
      },
      mockClientWithSeedId
    );
    assert.ok(feedWithSeed.stories.length >= 1);
    assert.equal(feedWithSeed.stories[0].id, "story-topic-ai");
  });
});
