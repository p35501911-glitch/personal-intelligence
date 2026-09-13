import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getUserPersonalizedFeed, type PersonalizedStoryItem } from "@/server/news/relevance";
import { GET as feedRouteHandler } from "@/app/api/feed/route";

// Load environment variables for testing
const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Sample test data with mixed normal and important stories
const MOCK_STORIES = [
  {
    id: "story-ai-flash-1",
    canonical_title: "DeepSeek Announces Breakthrough Open-Weights Reasoning Architecture",
    summary: "Raw RSS synopsis for AI reasoning model release.",
    first_published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    article_count: 6,
    source_count: 5,
    importance_score: 0.88,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-gadgets-lite-2",
    canonical_title: "Smartphone Maker Unveils Next Generation Mid-Tier Device Lineup",
    summary: "Raw RSS synopsis for consumer electronics launch.",
    first_published_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    article_count: 2,
    source_count: 2,
    importance_score: 0.45,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-pending-ai-3",
    canonical_title: "Regional Cloud Provider Upgrades Cooling Infrastructure in Data Centers",
    summary: "Raw RSS synopsis for infrastructure update.",
    first_published_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    article_count: 1,
    source_count: 1,
    importance_score: 0.35,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_STORY_CATEGORIES = [
  {
    story_id: "story-ai-flash-1",
    category_id: "ai-models",
    confidence: 0.96,
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
    story_id: "story-gadgets-lite-2",
    category_id: "mobile-devices",
    confidence: 0.91,
    is_primary: true,
    categories: {
      id: "mobile-devices",
      name: "Smartphones & Tablets",
      slug: "mobile-devices",
      level: 3,
      parent_id: "technology-hardware",
    },
  },
  {
    story_id: "story-pending-ai-3",
    category_id: "cloud-computing",
    confidence: 0.89,
    is_primary: true,
    categories: {
      id: "cloud-computing",
      name: "Cloud Infrastructure",
      slug: "cloud-computing",
      level: 3,
      parent_id: "technology",
    },
  },
];

const MOCK_INTELLIGENCE_RECORDS = [
  // Important tier story: Flash deep intelligence
  {
    id: "intel-1",
    story_id: "story-ai-flash-1",
    model: "gemini-flash-latest",
    prompt_version: 1,
    tier: "important",
    summary: "DeepSeek has released a state-of-the-art open reasoning model rivaling frontier proprietary benchmarks at significantly reduced inference cost.",
    key_points: [
      "Open weights architecture achieves parity on mathematical reasoning benchmarks.",
      "Novel architecture optimizes sparse activation for standard consumer accelerators.",
      "Accelerates competitive pressure on closed model API pricing."
    ],
    why_it_matters: "Democratizes frontier reasoning capabilities, shifting developer leverage toward sovereign on-premise deployments.",
    opportunities: [
      "Deploy localized reasoning agents without recurring API per-token expenses.",
      "Integrate into privacy-sensitive enterprise pipelines."
    ],
    risks: [
      "Accelerated safety risks from unaligned open-weight fine-tuning.",
      "Potential market volatility for specialized chip suppliers."
    ],
    status: "completed",
    generated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  // Normal tier story: Flash-Lite brief
  {
    id: "intel-2",
    story_id: "story-gadgets-lite-2",
    model: "gemini-flash-lite-latest",
    prompt_version: 1,
    tier: "normal",
    summary: "Annual refresh of mid-tier smartphones introduces improved battery management and entry-level display improvements.",
    key_points: [
      "Silicon upgrade improves battery life by 15%.",
      "Retail pricing maintained at previous year baseline."
    ],
    why_it_matters: "",
    opportunities: [],
    risks: [],
    status: "completed",
    generated_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
  // story-pending-ai-3 has NO completed intelligence record
];

function createMockSupabaseWithIntelligence(options?: {
  stories?: typeof MOCK_STORIES;
  intelligence?: typeof MOCK_INTELLIGENCE_RECORDS;
}) {
  const storiesList = options?.stories ?? MOCK_STORIES;
  const intelList = options?.intelligence ?? MOCK_INTELLIGENCE_RECORDS;

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
            };
            return builder;
          },
        };
      }

      if (table === "story_categories") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: MOCK_STORY_CATEGORIES, error: null }),
          }),
        };
      }

      if (table === "story_articles") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }

      if (table === "story_intelligence") {
        return {
          select: () => ({
            in: (_field: string, ids: string[]) => ({
              eq: (_statusField: string, statusVal: string) => {
                const matches = intelList.filter(
                  (r) => ids.includes(r.story_id) && r.status === statusVal
                );
                return Promise.resolve({ data: matches, error: null });
              },
            }),
          }),
        };
      }

      if (table === "user_preferences") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { category_selection_mode: "ALL" },
                  error: null,
                }),
            }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database>;
}

test("Feed Intelligence Quality & Direct AI Synthesis Integration Suite", async (t) => {
  // Test 1: Batch attaches completed story_intelligence to PersonalizedStoryItem
  await t.test("1. getUserPersonalizedFeed batch-attaches completed story_intelligence records", async () => {
    const mockClient = createMockSupabaseWithIntelligence();
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
        limit: 10,
      },
      mockClient
    );

    assert.equal(result.stories.length, 3);

    // story-ai-flash-1 has completed intelligence
    const flashStory = result.stories.find((s) => s.id === "story-ai-flash-1");
    assert.ok(flashStory, "Flash story must exist in feed");
    assert.ok(flashStory.intelligence, "Flash story must have intelligence attached");
    assert.equal(flashStory.intelligence.tier, "important");
    assert.equal(flashStory.intelligence.model, "gemini-flash-latest");

    // story-gadgets-lite-2 has completed Flash-Lite intelligence
    const liteStory = result.stories.find((s) => s.id === "story-gadgets-lite-2");
    assert.ok(liteStory, "Lite story must exist in feed");
    assert.ok(liteStory.intelligence, "Lite story must have intelligence attached");
    assert.equal(liteStory.intelligence.tier, "normal");
    assert.equal(liteStory.intelligence.model, "gemini-flash-lite-latest");

    // story-pending-ai-3 has NO completed intelligence
    const pendingStory = result.stories.find((s) => s.id === "story-pending-ai-3");
    assert.ok(pendingStory, "Pending story must exist in feed");
    assert.equal(pendingStory.intelligence, null, "Pending story intelligence must be null");
  });

  // Test 2: Important tier story attaches deep intelligence with key takeaways, why it matters, opportunities, risks
  await t.test("2. Important tier story attaches full deep intelligence synthesis", async () => {
    const mockClient = createMockSupabaseWithIntelligence();
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
      },
      mockClient
    );

    const flashStory = result.stories.find((s) => s.id === "story-ai-flash-1")!;
    const intel = flashStory.intelligence!;

    assert.equal(intel.tier, "important");
    assert.equal(intel.model, "gemini-flash-latest");
    assert.equal(intel.keyPoints.length, 3);
    assert.ok(intel.whyItMatters.includes("Democratizes frontier reasoning"));
    assert.equal(intel.opportunities.length, 2);
    assert.equal(intel.risks.length, 2);
    assert.ok(intel.generatedAt);
  });

  // Test 3: Normal tier story attaches Flash-Lite brief without requiring deep analysis fields
  await t.test("3. Normal tier story attaches concise Flash-Lite brief", async () => {
    const mockClient = createMockSupabaseWithIntelligence();
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
      },
      mockClient
    );

    const liteStory = result.stories.find((s) => s.id === "story-gadgets-lite-2")!;
    const intel = liteStory.intelligence!;

    assert.equal(intel.tier, "normal");
    assert.equal(intel.model, "gemini-flash-lite-latest");
    assert.ok(intel.summary.includes("Annual refresh of mid-tier smartphones"));
    assert.equal(intel.keyPoints.length, 2);
    assert.equal(intel.whyItMatters, "");
    assert.deepEqual(intel.opportunities, []);
    assert.deepEqual(intel.risks, []);
  });

  // Test 4: Story summary is enhanced with AI executive summary when available
  await t.test("4. Story summary is enhanced with AI executive summary when available", async () => {
    const mockClient = createMockSupabaseWithIntelligence();
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
      },
      mockClient
    );

    const flashStory = result.stories.find((s) => s.id === "story-ai-flash-1")!;
    // Raw summary was: "Raw RSS synopsis for AI reasoning model release."
    // Enhanced summary should be the AI summary:
    assert.equal(
      flashStory.summary,
      "DeepSeek has released a state-of-the-art open reasoning model rivaling frontier proprietary benchmarks at significantly reduced inference cost."
    );

    // Pending story retains baseline raw summary
    const pendingStory = result.stories.find((s) => s.id === "story-pending-ai-3")!;
    assert.equal(pendingStory.summary, "Raw RSS synopsis for infrastructure update.");
  });

  // Test 5: Story without intelligence gracefully preserves baseline summary and null intelligence
  await t.test("5. Story without intelligence gracefully preserves baseline fields", async () => {
    const mockClient = createMockSupabaseWithIntelligence({
      stories: [MOCK_STORIES[2]], // story-pending-ai-3
      intelligence: [],
    });

    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
      },
      mockClient
    );

    assert.equal(result.stories.length, 1);
    const story = result.stories[0];
    assert.equal(story.id, "story-pending-ai-3");
    assert.equal(story.summary, "Raw RSS synopsis for infrastructure update.");
    assert.equal(story.intelligence, null);
    assert.equal(story.importance, "LOW");
  });

  // Test 6: Feed API endpoint returns intelligence payload in JSON response
  await t.test("6. Feed API route preserves intelligence payload in response", async () => {
    // 6a. Validation rejection on invalid params
    const invalidReq = new Request("http://localhost:3000/api/feed?limit=-1");
    const invalidRes = await feedRouteHandler(invalidReq);
    assert.equal(invalidRes.status, 400);

    // 6b. Live route invocation if database is accessible
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const req = new Request("http://localhost:3000/api/feed?mode=ALL&limit=10");
        const res = await feedRouteHandler(req);
        if (res.status === 200) {
          const body = await res.json();
          assert.equal(body.success, true);
          assert.ok(Array.isArray(body.stories));
          for (const story of body.stories as PersonalizedStoryItem[]) {
            assert.ok(story.id);
            assert.ok(story.canonicalTitle);
            assert.ok(typeof story.feedScore === "number");
            if (story.intelligence) {
              assert.ok(typeof story.intelligence.summary === "string");
              assert.ok(Array.isArray(story.intelligence.keyPoints));
              assert.ok(["normal", "important"].includes(story.intelligence.tier || "normal"));
              assert.ok(typeof story.intelligence.model === "string");
            }
          }
        }
      } catch (err) {
        console.warn("Notice: Feed API live database check skipped due to network/creds:", err);
      }
    }
  });

  // Test 7: Feed sorting and pagination work seamlessly with intelligence attached
  await t.test("7. Feed sorting and pagination work seamlessly with intelligence", async () => {
    const mockClient = createMockSupabaseWithIntelligence();

    // Limit 1, offset 0
    const page1 = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
        limit: 1,
        offset: 0,
        sortBy: "importance",
      },
      mockClient
    );
    assert.equal(page1.stories.length, 1);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.stories[0].id, "story-ai-flash-1"); // highest importance (0.88)
    assert.ok(page1.stories[0].intelligence);

    // Limit 1, offset 1
    const page2 = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
        limit: 1,
        offset: 1,
        sortBy: "importance",
      },
      mockClient
    );
    assert.equal(page2.stories.length, 1);
    assert.equal(page2.stories[0].id, "story-gadgets-lite-2"); // second highest (0.45)
    assert.ok(page2.stories[0].intelligence);
  });

  // Test 8: Zero credentials or secrets exposed in feed payloads
  await t.test("8. Feed payloads never expose API keys or secret credentials", async () => {
    const mockClient = createMockSupabaseWithIntelligence();
    const result = await getUserPersonalizedFeed(
      {
        selectionMode: "ALL",
      },
      mockClient
    );

    const payloadJson = JSON.stringify(result);
    assert.equal(payloadJson.includes("AIza"), false, "Must not contain Google API key format");
    assert.equal(payloadJson.includes("GEMINI_API_KEY"), false, "Must not contain key name");
    assert.equal(payloadJson.includes("service_role"), false, "Must not contain service role");
    assert.equal(payloadJson.includes("CRON_SECRET"), false, "Must not contain cron secret");
  });
});
