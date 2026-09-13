import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getUserPersonalizedFeed } from "@/server/news/relevance";
import { getStoryDetails } from "@/server/news/stories";
import { feedQuerySchema } from "@/app/api/feed/route";

// Sample test data
const MOCK_STORIES = [
  {
    id: "story-ai-1",
    canonical_title: "OpenAI Unveils Next-Gen Frontier Reasoning Model",
    summary: "A major update to language and reasoning capabilities.",
    first_published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    article_count: 5,
    source_count: 4,
    importance_score: 0.85,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-chips-2",
    canonical_title: "TSMC and Nvidia Announce Advanced Packaging Breakthrough",
    summary: "New semiconductor manufacturing facility opens.",
    first_published_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    article_count: 3,
    source_count: 3,
    importance_score: 0.68,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-health-3",
    canonical_title: "Clinical Trial Demonstrates High Efficacy in Novel Heart Therapy",
    summary: "Cardiology researchers publish multi-center study.",
    first_published_at: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    article_count: 2,
    source_count: 2,
    importance_score: 0.42,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_STORY_CATEGORIES = [
  // story-ai-1 belongs to ai-models (level 3, parent technology-ai, root technology)
  {
    story_id: "story-ai-1",
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
  // story-chips-2 belongs to semiconductors (level 3, parent technology-hardware, root technology)
  {
    story_id: "story-chips-2",
    category_id: "semiconductors",
    confidence: 0.92,
    is_primary: true,
    categories: {
      id: "semiconductors",
      name: "Semiconductors & Chips",
      slug: "semiconductors",
      level: 3,
      parent_id: "technology-hardware",
    },
  },
  // Also tag story-chips-2 with AI (multi-category synergy)
  {
    story_id: "story-chips-2",
    category_id: "technology-ai",
    confidence: 0.82,
    is_primary: false,
    categories: {
      id: "technology-ai",
      name: "Artificial Intelligence",
      slug: "technology-ai",
      level: 2,
      parent_id: "technology",
    },
  },
  // story-health-3 belongs to health-medicine (level 1 root)
  {
    story_id: "story-health-3",
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

const MOCK_STORY_ARTICLES = [
  {
    story_id: "story-ai-1",
    article_id: "art-1",
    articles: {
      id: "art-1",
      title: "OpenAI launches latest artificial intelligence model",
      url: "https://reuters.com/tech/openai-model",
      canonical_url: "https://reuters.com/tech/openai-model",
      published_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      image_url: "https://reuters.com/images/ai.jpg",
      author: "Tech Correspondent",
      provider: "rss",
      source_id: "src-1",
      sources: {
        id: "src-1",
        name: "Reuters",
        url: "https://reuters.com",
      },
    },
  },
  {
    story_id: "story-ai-1",
    article_id: "art-2",
    articles: {
      id: "art-2",
      title: "OpenAI announces new AI system",
      url: "https://bbc.com/news/technology-ai-model",
      canonical_url: "https://bbc.com/news/technology-ai-model",
      published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      image_url: null,
      author: null,
      provider: "rss",
      source_id: "src-2",
      sources: {
        id: "src-2",
        name: "BBC News",
        url: "https://bbc.com",
      },
    },
  },
];

function createMockSupabase(storiesList = MOCK_STORIES) {
  return {
    from(table: string) {
      if (table === "stories") {
        return {
          select: () => {
            const builder = {
              eq: () => builder,
              gte: () => builder,
              order: () => builder,
              limit: () => Promise.resolve({ data: storiesList, error: null }),
              maybeSingle: () => {
                const singleStory = storiesList.find((s) => s.id === "story-ai-1") || storiesList[0] || null;
                return Promise.resolve({ data: singleStory, error: null });
              },
            };
            return builder;
          },
        };
      }

      if (table === "story_categories") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: MOCK_STORY_CATEGORIES, error: null }),
            eq: () => Promise.resolve({ data: MOCK_STORY_CATEGORIES.filter((c) => c.story_id === "story-ai-1"), error: null }),
          }),
        };
      }

      if (table === "story_articles") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: MOCK_STORY_ARTICLES, error: null }),
            eq: () => Promise.resolve({ data: MOCK_STORY_ARTICLES.filter((a) => a.story_id === "story-ai-1"), error: null }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;
}

test("Phase 3A — Comprehensive Feed & Story Detail Suite", async (t) => {
  // Test 1: CATEGORY mode returns matching stories
  await t.test("1. CATEGORY mode returns matching stories", async () => {
    const mockClient = createMockSupabase();
    const result = await getUserPersonalizedFeed(
      {
        userCategoryIds: ["technology-ai"],
        selectionMode: "CATEGORY",
      },
      mockClient
    );

    assert.equal(result.mode, "CATEGORY");
    assert.ok(result.stories.length >= 1, "Should return at least one story matching technology-ai");
    const aiStory = result.stories.find((s) => s.id === "story-ai-1");
    assert.ok(aiStory, "story-ai-1 must be included");
    assert.equal(aiStory?.importance, "CRITICAL");
  });

  // Test 2: CATEGORY mode excludes unrelated stories
  await t.test("2. CATEGORY mode excludes unrelated stories", async () => {
    const mockClient = createMockSupabase();
    const result = await getUserPersonalizedFeed(
      {
        userCategoryIds: ["technology-ai"],
        selectionMode: "CATEGORY",
      },
      mockClient
    );

    // Health story has 0 relevance to technology-ai and must be excluded
    const healthStory = result.stories.find((s) => s.id === "story-health-3");
    assert.equal(healthStory, undefined, "Unrelated health story must be excluded in CATEGORY mode");
  });

  // Test 3: ALL mode returns global stories
  await t.test("3. ALL mode returns global stories across categories", async () => {
    const mockClient = createMockSupabase();
    const result = await getUserPersonalizedFeed(
      {
        userCategoryIds: [],
        selectionMode: "ALL",
      },
      mockClient
    );

    assert.equal(result.mode, "ALL");
    assert.equal(result.stories.length, 3, "ALL mode must return all 3 stories");
    const healthStory = result.stories.find((s) => s.id === "story-health-3");
    assert.ok(healthStory, "Health story must be present in ALL mode");
  });

  // Test 4: Multiple selected categories work
  await t.test("4. Multiple selected categories combine and trigger synergy boost", async () => {
    const mockClient = createMockSupabase();
    const result = await getUserPersonalizedFeed(
      {
        userCategoryIds: ["technology-ai", "semiconductors"],
        selectionMode: "CATEGORY",
      },
      mockClient
    );

    assert.equal(result.stories.length, 2, "Should match both AI and semiconductor stories");
    const dualMatchStory = result.stories.find((s) => s.id === "story-chips-2");
    assert.ok(dualMatchStory, "story-chips-2 must be present");
    assert.ok(dualMatchStory.relevance.synergyBoost > 0, "Dual category match should have synergy boost");
  });

  // Test 5: Parent/subcategory/topic hierarchy works correctly
  await t.test("5. Parent / subcategory / topic hierarchy matches correctly", async () => {
    const mockClient = createMockSupabase();

    // 5a. Level 1 (Main Root) match: selecting root "technology" should match child topic "ai-models"
    const rootResult = await getUserPersonalizedFeed(
      {
        userCategoryIds: ["technology"],
        selectionMode: "CATEGORY",
      },
      mockClient
    );
    assert.ok(
      rootResult.stories.some((s) => s.id === "story-ai-1"),
      "Selecting root 'technology' must match story tagged with child topic 'ai-models'"
    );

    // 5b. Level 2 (Subcategory) match: selecting "technology-ai" matches child topic "ai-models"
    const subResult = await getUserPersonalizedFeed(
      {
        userCategoryIds: ["technology-ai"],
        selectionMode: "CATEGORY",
      },
      mockClient
    );
    assert.ok(
      subResult.stories.some((s) => s.id === "story-ai-1"),
      "Selecting subcategory 'technology-ai' must match child topic 'ai-models'"
    );

    // 5c. Level 3 (Direct Topic) match
    const topicResult = await getUserPersonalizedFeed(
      {
        userCategoryIds: ["ai-models"],
        selectionMode: "CATEGORY",
      },
      mockClient
    );
    assert.ok(
      topicResult.stories.some((s) => s.id === "story-ai-1"),
      "Selecting direct topic 'ai-models' must match story-ai-1"
    );
  });

  // Test 6: Importance filter works
  await t.test("6. Importance filter works (minImportance)", async () => {
    const mockClient = createMockSupabase();
    // Filter with minImportance >= 0.70 (only story-ai-1 at 0.85 should pass)
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
        minImportance: 0.70,
      },
      mockClient
    );

    assert.equal(result.stories.length, 1);
    assert.equal(result.stories[0].id, "story-ai-1");
  });

  // Test 7: Pagination works
  await t.test("7. Pagination works (limit, offset, hasMore)", async () => {
    const mockClient = createMockSupabase();

    const page1 = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
        limit: 2,
        offset: 0,
      },
      mockClient
    );
    assert.equal(page1.stories.length, 2);
    assert.equal(page1.hasMore, true, "Page 1 should have hasMore: true");
    assert.equal(page1.count, 3);

    const page2 = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
        limit: 2,
        offset: 2,
      },
      mockClient
    );
    assert.equal(page2.stories.length, 1);
    assert.equal(page2.hasMore, false, "Page 2 should have hasMore: false");
  });

  // Test 8: Newest sorting works
  await t.test("8. Newest sorting works (sortBy: 'recent')", async () => {
    const mockClient = createMockSupabase();
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
        sortBy: "recent",
      },
      mockClient
    );

    for (let i = 0; i < result.stories.length - 1; i++) {
      const currentTime = new Date(result.stories[i].latestPublishedAt).getTime();
      const nextTime = new Date(result.stories[i + 1].latestPublishedAt).getTime();
      assert.ok(currentTime >= nextTime, "Stories must be in descending order of latestPublishedAt");
    }
  });

  // Test 9: Empty feed works
  await t.test("9. Empty feed works gracefully", async () => {
    const mockClient = createMockSupabase([]);
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
      },
      mockClient
    );

    assert.equal(result.stories.length, 0);
    assert.equal(result.count, 0);
    assert.equal(result.hasMore, false);
  });

  // Test 10: Story detail loads correctly
  await t.test("10. Story detail loads correctly with getStoryDetails", async () => {
    const mockClient = createMockSupabase();
    const details = await getStoryDetails("story-ai-1", mockClient);

    assert.ok(details, "Story details must be returned");
    assert.equal(details.id, "story-ai-1");
    assert.equal(details.importance, "CRITICAL");
    assert.equal(details.sourceCount, 4);
    assert.ok(details.articles.length > 0, "Attached articles must be populated");
  });

  // Test 11: Publisher article links are preserved
  await t.test("11. Publisher article links are preserved in story detail", async () => {
    const mockClient = createMockSupabase();
    const details = await getStoryDetails("story-ai-1", mockClient);

    assert.ok(details?.articles && details.articles.length > 0);
    const reutersArticle = details.articles.find((a) => a.publisher === "Reuters");
    assert.ok(reutersArticle, "Reuters article must be in coverage list");
    assert.equal(reutersArticle.url, "https://reuters.com/tech/openai-model");
    assert.equal(reutersArticle.publisherUrl, "https://reuters.com");
  });

  // Test 12: Unauthorized users cannot access another user's personalized feed
  await t.test("12. Unauthorized users cannot supply userId parameter to read another feed", async () => {
    // 12a: Verify query schema strictly drops/ignores arbitrary userId parameters
    const parsed = feedQuerySchema.safeParse({ userId: "victim-user-id" });
    assert.equal(parsed.success, true);
    // @ts-expect-error Checking that userId is not part of validated query schema
    assert.equal(parsed.data.userId, undefined);

    // 12b: Verify getUserPersonalizedFeed with mock client isolates users
    const mockClient = {
      from(table: string) {
        if (table === "user_preferences") {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: () => {
                  if (val === "victim-user") {
                    return Promise.resolve({
                      data: { category_selection_mode: "CATEGORY" },
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              }),
            }),
          };
        }
        if (table === "user_category_preferences") {
          return {
            select: () => ({
              eq: (_col: string, val: string) => {
                if (val === "victim-user") {
                  return Promise.resolve({
                    data: [{ category_id: "secret-finance-category" }],
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: null });
              },
            }),
          };
        }
        if (table === "stories") {
          return {
            select: () => {
              const b = {
                eq: () => b,
                gte: () => b,
                order: () => b,
                limit: () => Promise.resolve({ data: [], error: null }),
              };
              return b;
            },
          };
        }
        return {};
      },
    } as unknown as SupabaseClient<Database>;

    // When an unauthorized user tries to read the feed
    const attackerFeed = await getUserPersonalizedFeed(
      {
        userId: "attacker-user",
        selectionMode: "CATEGORY",
      },
      mockClient
    );
    // Attacker gets their own category count (0), never the victim's preferences
    assert.equal(attackerFeed.userCategoryCount, 0);
  });

  // Test 13: Service-role and backend credentials never reach the client
  await t.test("13. Service-role credentials never reach the client", () => {
    const clientTargets = [
      path.join(process.cwd(), "src", "components"),
      path.join(process.cwd(), "src", "app", "page.tsx"),
      path.join(process.cwd(), "src", "app", "onboarding"),
      path.join(process.cwd(), "src", "lib", "supabase", "client.ts"),
    ];

    const forbiddenTokens = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "CRON_SECRET",
      "DATABASE_URL",
      "POSTGRES_PASSWORD",
      "SUPABASE_SECRET_KEY",
    ];

    const checkPath = (targetPath: string) => {
      if (!fs.existsSync(targetPath)) return;
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        if (/\.(tsx|ts|jsx|js)$/.test(targetPath)) {
          const content = fs.readFileSync(targetPath, "utf-8");
          for (const token of forbiddenTokens) {
            assert.equal(
              content.includes(token),
              false,
              `Client file ${targetPath} must NEVER reference ${token}`
            );
          }
        }
        return;
      }
      const entries = fs.readdirSync(targetPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(targetPath, entry.name);
        if (entry.isDirectory()) {
          checkPath(fullPath);
        } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          for (const token of forbiddenTokens) {
            assert.equal(
              content.includes(token),
              false,
              `Client file ${fullPath} must NEVER reference ${token}`
            );
          }
        }
      }
    };

    clientTargets.forEach(checkPath);
  });
});
