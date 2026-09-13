import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  saveStory,
  unsaveStory,
  isStorySaved,
  getSavedStoryIds,
  getSavedStories,
  type SavedStoryItem,
} from "@/server/news/saved-stories";
import { getUserPersonalizedFeed } from "@/server/news/relevance";
import {
  GET as getSavedStoriesRoute,
  POST as postSavedStoryRoute,
  saveStoryBodySchema,
  getSavedStoriesQuerySchema,
} from "@/app/api/saved-stories/route";
import { DELETE as deleteSavedStoryRoute } from "@/app/api/saved-stories/[storyId]/route";

// Load test environment
const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

interface MockSavedRecord {
  id: string;
  user_id: string;
  story_id: string;
  created_at: string;
}

const MOCK_STORIES = [
  {
    id: "story-tech-1",
    canonical_title: "Next-Gen Quantum Processor Achieves Fault-Tolerant Logical Qubits",
    summary: "Researchers achieve milestone in scalable error-corrected quantum computation.",
    first_published_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 1800 * 1000).toISOString(),
    article_count: 5,
    source_count: 4,
    importance_score: 0.92,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-ai-2",
    canonical_title: "Open Weights Reasoning System Outperforms Closed Frontier Benchmarks",
    summary: "Novel mixture-of-agents architecture released with permissive license.",
    first_published_at: new Date(Date.now() - 7200 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    article_count: 8,
    source_count: 6,
    importance_score: 0.88,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "story-cloud-3",
    canonical_title: "Global Infrastructure Provider Expands Sustainable Data Hubs",
    summary: "New zero-emission geothermal computing centres launch across Europe.",
    first_published_at: new Date(Date.now() - 10800 * 1000).toISOString(),
    latest_published_at: new Date(Date.now() - 7200 * 1000).toISOString(),
    article_count: 3,
    source_count: 2,
    importance_score: 0.55,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_STORY_CATEGORIES = [
  {
    story_id: "story-tech-1",
    category_id: "quantum-computing",
    confidence: 0.95,
    is_primary: true,
    categories: {
      id: "quantum-computing",
      name: "Quantum Computing",
      slug: "quantum-computing",
      level: 3,
      parent_id: "technology-hardware",
    },
  },
  {
    story_id: "story-ai-2",
    category_id: "ai-models",
    confidence: 0.98,
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
    story_id: "story-cloud-3",
    category_id: "cloud-computing",
    confidence: 0.85,
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

const MOCK_STORY_ARTICLES = [
  {
    story_id: "story-tech-1",
    articles: {
      id: "art-1",
      image_url: "https://images.example.com/quantum.jpg",
      source_id: "src-techcrunch",
      sources: {
        id: "src-techcrunch",
        name: "TechCrunch",
        url: "https://techcrunch.com",
      },
    },
  },
  {
    story_id: "story-ai-2",
    articles: {
      id: "art-2",
      image_url: "https://images.example.com/reasoning.jpg",
      source_id: "src-verge",
      sources: {
        id: "src-verge",
        name: "The Verge",
        url: "https://theverge.com",
      },
    },
  },
];

const MOCK_INTELLIGENCE = [
  {
    id: "intel-1",
    story_id: "story-tech-1",
    model: "gemini-flash-latest",
    prompt_version: 1,
    tier: "important",
    summary: "Quantum breakthrough demonstrates topological error suppression for 100+ logical qubits.",
    key_points: [
      "Physical qubit noise reduced beneath fault tolerance threshold.",
      "Commercial roadmap accelerated by 3-5 years.",
    ],
    why_it_matters: "Brings cryptographically and chemically relevant quantum simulations within near-term reach.",
    opportunities: [
      "Accelerate pharmaceutical molecular dynamics pipelines.",
      "Explore quantum resistant encryption migrations.",
    ],
    risks: [
      "Early obsolescence of legacy RSA public key infrastructure.",
    ],
    status: "completed",
    generated_at: new Date(Date.now() - 1200 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1200 * 1000).toISOString(),
  },
  {
    id: "intel-2",
    story_id: "story-ai-2",
    model: "gemini-flash-lite-latest",
    prompt_version: 1,
    tier: "normal",
    summary: "Open-weight reasoning model matches proprietary systems on math benchmarks.",
    key_points: [
      "Permissive Apache 2.0 license enables commercial hosting.",
      "Runs on dual consumer workstation GPUs.",
    ],
    why_it_matters: "",
    opportunities: [],
    risks: [],
    status: "completed",
    generated_at: new Date(Date.now() - 2400 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2400 * 1000).toISOString(),
  },
];

function createMockSupabase(initialSaved: MockSavedRecord[] = []) {
  const savedRecords: MockSavedRecord[] = [...initialSaved];

  return {
    _savedRecords: savedRecords,
    from(table: string) {
      if (table === "user_saved_stories") {
        return {
          upsert: (record: { user_id: string; story_id: string }) => {
            let existing = savedRecords.find(
              (r) => r.user_id === record.user_id && r.story_id === record.story_id
            );
            if (!existing) {
              existing = {
                id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                user_id: record.user_id,
                story_id: record.story_id,
                created_at: new Date().toISOString(),
              };
              savedRecords.push(existing);
            }
            return {
              select: () => ({
                single: () => Promise.resolve({ data: existing, error: null }),
              }),
            };
          },
          delete: () => ({
            eq: (field1: string, val1: string) => ({
              eq: (field2: string, val2: string) => {
                const index = savedRecords.findIndex(
                  (r) =>
                    (field1 === "user_id" ? r.user_id : r.story_id) === val1 &&
                    (field2 === "story_id" ? r.story_id : r.user_id) === val2
                );
                if (index !== -1) {
                  savedRecords.splice(index, 1);
                }
                return Promise.resolve({ error: null });
              },
            }),
          }),
          select: () => ({
            eq: (field: string, val: string) => ({
              maybeSingle: () => {
                const found = savedRecords.find(
                  (r) => (field === "user_id" ? r.user_id : r.story_id) === val
                );
                return Promise.resolve({ data: found ? { id: found.id } : null, error: null });
              },
              in: (_inField: string, ids: string[]) => {
                const matches = savedRecords.filter(
                  (r) => r.user_id === val && ids.includes(r.story_id)
                );
                return Promise.resolve({ data: matches, error: null });
              },
              order: () => {
                const userRecords = savedRecords
                  .filter((r) => r.user_id === val)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                return Promise.resolve({ data: userRecords, error: null });
              },
              eq: (field2: string, val2: string) => ({
                maybeSingle: () => {
                  const found = savedRecords.find(
                    (r) =>
                      (field === "user_id" ? r.user_id : r.story_id) === val &&
                      (field2 === "story_id" ? r.story_id : r.user_id) === val2
                  );
                  return Promise.resolve({ data: found ? { id: found.id } : null, error: null });
                },
              }),
            }),
          }),
        };
      }

      if (table === "stories") {
        return {
          select: () => ({
            in: (_field: string, ids: string[]) => {
              const matched = MOCK_STORIES.filter((s) => ids.includes(s.id));
              return Promise.resolve({ data: matched, error: null });
            },
            eq: () => {
              const builder = {
                gte: () => builder,
                order: () => builder,
                limit: () => Promise.resolve({ data: MOCK_STORIES, error: null }),
              };
              return builder;
            },
          }),
        };
      }

      if (table === "story_categories") {
        return {
          select: () => ({
            in: (_field: string, ids: string[]) => {
              const matched = MOCK_STORY_CATEGORIES.filter((c) => ids.includes(c.story_id));
              return Promise.resolve({ data: matched, error: null });
            },
          }),
        };
      }

      if (table === "story_articles") {
        return {
          select: () => ({
            in: (_field: string, ids: string[]) => {
              const matched = MOCK_STORY_ARTICLES.filter((a) => ids.includes(a.story_id));
              return Promise.resolve({ data: matched, error: null });
            },
          }),
        };
      }

      if (table === "story_intelligence") {
        return {
          select: () => ({
            in: (_field: string, ids: string[]) => ({
              eq: (_statusField: string, statusVal: string) => {
                const matched = MOCK_INTELLIGENCE.filter(
                  (i) => ids.includes(i.story_id) && i.status === statusVal
                );
                return Promise.resolve({ data: matched, error: null });
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
  } as unknown as SupabaseClient<Database> & { _savedRecords: MockSavedRecord[] };
}

test("Phase 3C: User Bookmarks & Saved Intelligence Comprehensive Suite", async (t) => {
  // Test 1: saveStory inserts row into user_saved_stories
  await t.test("1. saveStory inserts a new bookmark row into user_saved_stories", async () => {
    const mockClient = createMockSupabase();
    const result = await saveStory("user-1", "story-tech-1", mockClient);

    assert.ok(result.id, "Returned bookmark ID must exist");
    assert.equal(result.userId, "user-1");
    assert.equal(result.storyId, "story-tech-1");
    assert.ok(result.createdAt, "Bookmark creation timestamp must exist");

    assert.equal(mockClient._savedRecords.length, 1);
    assert.equal(mockClient._savedRecords[0].user_id, "user-1");
    assert.equal(mockClient._savedRecords[0].story_id, "story-tech-1");
  });

  // Test 2: Duplicate save is idempotent/safe (upsert with onConflict)
  await t.test("2. Duplicate saveStory calls are idempotent and return the existing record safely", async () => {
    const mockClient = createMockSupabase();
    const firstSave = await saveStory("user-1", "story-tech-1", mockClient);
    const secondSave = await saveStory("user-1", "story-tech-1", mockClient);

    assert.equal(mockClient._savedRecords.length, 1, "Must not create duplicate rows for same user and story");
    assert.equal(firstSave.id, secondSave.id);
    assert.equal(firstSave.storyId, secondSave.storyId);
  });

  // Test 3: unsaveStory removes row from user_saved_stories
  await t.test("3. unsaveStory deletes the bookmark row from user_saved_stories", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-existing",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date().toISOString(),
      },
    ]);

    assert.equal(mockClient._savedRecords.length, 1);
    const res = await unsaveStory("user-1", "story-tech-1", mockClient);

    assert.equal(res.success, true);
    assert.equal(res.storyId, "story-tech-1");
    assert.equal(mockClient._savedRecords.length, 0, "Bookmark row must be removed");
  });

  // Test 4: Unsave nonexistent bookmark returns success safely
  await t.test("4. unsaveStory on nonexistent bookmark completes successfully without throwing", async () => {
    const mockClient = createMockSupabase();
    const res = await unsaveStory("user-1", "nonexistent-story", mockClient);

    assert.equal(res.success, true);
    assert.equal(res.storyId, "nonexistent-story");
  });

  // Test 5: getSavedStories returns stories with pagination
  await t.test("5. getSavedStories returns saved stories with full dossier and pagination metadata", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date(Date.now() - 10000).toISOString(),
      },
      {
        id: "saved-2",
        user_id: "user-1",
        story_id: "story-ai-2",
        created_at: new Date(Date.now() - 5000).toISOString(),
      },
    ]);

    const res = await getSavedStories("user-1", { limit: 10, offset: 0 }, mockClient);

    assert.equal(res.stories.length, 2);
    assert.equal(res.pagination.count, 2);
    assert.equal(res.pagination.limit, 10);
    assert.equal(res.pagination.offset, 0);
    assert.equal(res.pagination.hasMore, false);

    // Most recent bookmark should be first (story-ai-2)
    assert.equal(res.stories[0].id, "story-ai-2");
    assert.equal(res.stories[0].isSaved, true);
    assert.equal(res.stories[1].id, "story-tech-1");
    assert.equal(res.stories[1].isSaved, true);
  });

  // Test 6: Pagination bounds and offsets (limit, offset, hasMore)
  await t.test("6. getSavedStories respects pagination limit, offset, and computes hasMore correctly", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date(Date.now() - 15000).toISOString(),
      },
      {
        id: "saved-2",
        user_id: "user-1",
        story_id: "story-ai-2",
        created_at: new Date(Date.now() - 10000).toISOString(),
      },
      {
        id: "saved-3",
        user_id: "user-1",
        story_id: "story-cloud-3",
        created_at: new Date(Date.now() - 5000).toISOString(),
      },
    ]);

    // Page 1: limit 2, offset 0
    const page1 = await getSavedStories("user-1", { limit: 2, offset: 0 }, mockClient);
    assert.equal(page1.stories.length, 2);
    assert.equal(page1.pagination.hasMore, true);
    assert.equal(page1.pagination.count, 3);
    assert.equal(page1.stories[0].id, "story-cloud-3");
    assert.equal(page1.stories[1].id, "story-ai-2");

    // Page 2: limit 2, offset 2
    const page2 = await getSavedStories("user-1", { limit: 2, offset: 2 }, mockClient);
    assert.equal(page2.stories.length, 1);
    assert.equal(page2.pagination.hasMore, false);
    assert.equal(page2.stories[0].id, "story-tech-1");
  });

  // Test 7: getSavedStoryIds returns Set<string>
  await t.test("7. getSavedStoryIds returns Set<string> with exact saved story IDs", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date().toISOString(),
      },
    ]);

    const ids = await getSavedStoryIds("user-1", ["story-tech-1", "story-ai-2", "story-cloud-3"], mockClient);
    assert.ok(ids instanceof Set);
    assert.equal(ids.size, 1);
    assert.ok(ids.has("story-tech-1"));
    assert.equal(ids.has("story-ai-2"), false);
  });

  // Test 8: User isolation (User A cannot access or delete User B's bookmarks)
  await t.test("8. User isolation is strictly enforced: User A cannot see or delete User B's saved stories", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-a",
        user_id: "user-a",
        story_id: "story-tech-1",
        created_at: new Date().toISOString(),
      },
      {
        id: "saved-b",
        user_id: "user-b",
        story_id: "story-ai-2",
        created_at: new Date().toISOString(),
      },
    ]);

    // User A should only see story-tech-1
    const resA = await getSavedStories("user-a", {}, mockClient);
    assert.equal(resA.stories.length, 1);
    assert.equal(resA.stories[0].id, "story-tech-1");

    // User B should only see story-ai-2
    const resB = await getSavedStories("user-b", {}, mockClient);
    assert.equal(resB.stories.length, 1);
    assert.equal(resB.stories[0].id, "story-ai-2");

    // User A trying to unsave User B's story has no effect on User B's saved stories
    await unsaveStory("user-a", "story-ai-2", mockClient);
    const resBAfter = await getSavedStories("user-b", {}, mockClient);
    assert.equal(resBAfter.stories.length, 1, "User B's bookmark must remain intact");

    // isStorySaved strictly isolates by userId
    const isSavedForA = await isStorySaved("user-a", "story-ai-2", mockClient);
    const isSavedForB = await isStorySaved("user-b", "story-ai-2", mockClient);
    assert.equal(isSavedForA, false);
    assert.equal(isSavedForB, true);
  });

  // Test 9: Authentication enforcement (401 when unauthenticated on GET/POST/DELETE)
  await t.test("9. Route handlers enforce authentication, returning 401 when unauthenticated", async () => {
    // 9a. POST /api/saved-stories
    const postReq = new Request("http://localhost:3000/api/saved-stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId: "story-tech-1" }),
    });
    const postRes = await postSavedStoryRoute(postReq);
    assert.equal(postRes.status, 401);
    const postJson = await postRes.json();
    assert.equal(postJson.success, false);
    assert.equal(postJson.error, "Unauthorized");

    // 9b. GET /api/saved-stories
    const getReq = new Request("http://localhost:3000/api/saved-stories");
    const getRes = await getSavedStoriesRoute(getReq);
    assert.equal(getRes.status, 401);
    const getJson = await getRes.json();
    assert.equal(getJson.success, false);
    assert.equal(getJson.error, "Unauthorized");

    // 9c. DELETE /api/saved-stories/[storyId]
    const delReq = new Request("http://localhost:3000/api/saved-stories/story-tech-1", {
      method: "DELETE",
    });
    const delRes = await deleteSavedStoryRoute(delReq, {
      params: Promise.resolve({ storyId: "story-tech-1" }),
    });
    assert.equal(delRes.status, 401);
    const delJson = await delRes.json();
    assert.equal(delJson.success, false);
    assert.equal(delJson.error, "Unauthorized");
  });

  // Test 10: Client userId spoofing in body/query is rejected/ignored
  await t.test("10. Client userId spoofing is ignored by schemas and cannot override server session", () => {
    // POST body schema rejects/disallows arbitrary userId
    const bodyParsed = saveStoryBodySchema.safeParse({
      storyId: "story-tech-1",
      userId: "spoofed-attacker-id",
    });
    assert.equal(bodyParsed.success, true);
    // @ts-expect-error verifying userId is not in schema
    assert.equal(bodyParsed.data.userId, undefined);

    // GET query schema rejects/disallows arbitrary userId
    const queryParsed = getSavedStoriesQuerySchema.safeParse({
      userId: "spoofed-attacker-id",
      limit: 10,
    });
    assert.equal(queryParsed.success, true);
    // @ts-expect-error verifying userId is not in schema
    assert.equal(queryParsed.data.userId, undefined);
  });

  // Test 11: Intelligence payload included with saved story (StoryIntelligenceDetail)
  await t.test("11. Saved story dossier includes completed story_intelligence detail payload", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date().toISOString(),
      },
    ]);

    const res = await getSavedStories("user-1", {}, mockClient);
    assert.equal(res.stories.length, 1);
    const item = res.stories[0];

    assert.ok(item.intelligence, "Story intelligence must be present");
    assert.equal(item.intelligence.tier, "important");
    assert.equal(item.intelligence.model, "gemini-flash-latest");
    assert.ok(item.intelligence.summary.includes("Quantum breakthrough"));
    assert.equal(item.intelligence.keyPoints.length, 2);
    assert.ok(item.intelligence.whyItMatters.length > 0);
    assert.equal(item.intelligence.opportunities.length, 2);
    assert.equal(item.intelligence.risks.length, 1);
  });

  // Test 12: Categories included and hierarchy preserved
  await t.test("12. Saved story dossier includes category tags with hierarchy and levels preserved", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-ai-2",
        created_at: new Date().toISOString(),
      },
    ]);

    const res = await getSavedStories("user-1", {}, mockClient);
    assert.equal(res.stories.length, 1);
    const item = res.stories[0];

    assert.ok(Array.isArray(item.categories));
    assert.ok(item.categories.length >= 1);
    const primaryCat = item.categories.find((c) => c.isPrimary);
    assert.ok(primaryCat, "Primary category must exist");
    assert.equal(primaryCat.categorySlug, "ai-models");
    assert.equal(primaryCat.level, 3);
  });

  // Test 13: Publishers and media included
  await t.test("13. Saved story dossier includes media imageUrl and publisher source consensus", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date().toISOString(),
      },
    ]);

    const res = await getSavedStories("user-1", {}, mockClient);
    assert.equal(res.stories.length, 1);
    const item = res.stories[0];

    assert.equal(item.imageUrl, "https://images.example.com/quantum.jpg");
    assert.ok(Array.isArray(item.sources));
    assert.equal(item.sources.length, 1);
    assert.equal(item.sources[0].name, "TechCrunch");
  });

  // Test 14: Feed item isSaved batch integration in getUserPersonalizedFeed
  await t.test("14. getUserPersonalizedFeed batch-annotates isSaved: true/false for authenticated user", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date().toISOString(),
      },
    ]);

    const feedResult = await getUserPersonalizedFeed(
      {
        userId: "user-1",
        selectionMode: "ALL",
        limit: 10,
      },
      mockClient
    );

    assert.ok(feedResult.stories.length >= 2);
    const savedItem = feedResult.stories.find((s) => s.id === "story-tech-1");
    const unsavedItem = feedResult.stories.find((s) => s.id === "story-ai-2");

    assert.ok(savedItem);
    assert.equal(savedItem.isSaved, true, "Bookmarked story must have isSaved: true in feed");

    assert.ok(unsavedItem);
    assert.equal(unsavedItem.isSaved, false, "Non-bookmarked story must have isSaved: false in feed");
  });

  // Test 15: Zero Gemini API calls from bookmark operations
  await t.test("15. Zero Gemini API calls are made during bookmarking, unsaving, or reading saved stories", async () => {
    // Intercept global fetch to verify no calls to Google Gemini API
    const originalFetch = globalThis.fetch;
    let geminiApiCallCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        geminiApiCallCount++;
        throw new Error("UNEXPECTED GEMINI API CALL DETECTED");
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const mockClient = createMockSupabase();

      // Save story
      await saveStory("user-1", "story-tech-1", mockClient);

      // Read saved stories
      const savedRes = await getSavedStories("user-1", {}, mockClient);
      assert.equal(savedRes.stories.length, 1);

      // Check isStorySaved
      const isSaved = await isStorySaved("user-1", "story-tech-1", mockClient);
      assert.equal(isSaved, true);

      // Unsave story
      await unsaveStory("user-1", "story-tech-1", mockClient);

      assert.equal(geminiApiCallCount, 0, "Bookmark operations must strictly make ZERO Gemini API calls");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Test 16: Empty saved state returns empty list with valid pagination
  await t.test("16. Empty saved state returns empty list with clean pagination metadata", async () => {
    const mockClient = createMockSupabase([]);
    const res = await getSavedStories("user-new", { limit: 20, offset: 0 }, mockClient);

    assert.equal(res.stories.length, 0);
    assert.equal(res.pagination.count, 0);
    assert.equal(res.pagination.limit, 20);
    assert.equal(res.pagination.offset, 0);
    assert.equal(res.pagination.hasMore, false);
  });

  // Test 17: Saved story detail compatibility with StoryDetailModal
  await t.test("17. SavedStoryItem interface is 100% compatible with StoryDetailModal properties", async () => {
    const mockClient = createMockSupabase([
      {
        id: "saved-1",
        user_id: "user-1",
        story_id: "story-tech-1",
        created_at: new Date().toISOString(),
      },
    ]);

    const res = await getSavedStories("user-1", {}, mockClient);
    assert.equal(res.stories.length, 1);
    const item: SavedStoryItem = res.stories[0];

    // Verify all required fields for StoryDetailModal
    assert.ok(typeof item.id === "string");
    assert.ok(typeof item.canonicalTitle === "string");
    assert.ok(typeof item.articleCount === "number");
    assert.ok(typeof item.sourceCount === "number");
    assert.ok(typeof item.importanceScore === "number");
    assert.ok(typeof item.importanceLevel === "string");
    assert.ok(Array.isArray(item.categories));
    assert.ok(Array.isArray(item.sources));
    assert.ok(item.intelligence);
    assert.ok(typeof item.savedAt === "string");
    assert.equal(item.isSaved, true);
  });
});
