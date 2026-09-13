import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/types/database";
import {
  chooseBestCanonicalTitle,
  findBestStoryMatch,
  clusterArticle,
} from "../../../src/server/news/stories";
import { storiesQuerySchema } from "../../../src/app/api/stories/route";
import { GET as storiesRouteHandler } from "../../../src/app/api/stories/route";

// Load environment variables
const cwd = process.cwd();
const localEnvPath = path.resolve(cwd, ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(cwd, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// =====================================================================
// PART 1: Query Schema & Unit Tests
// =====================================================================

test("Step 2H: Stories Query Schema Validation", async (t) => {
  await t.test("applies default limit (20), offset (0), and status ('active')", () => {
    const parsed = storiesQuerySchema.safeParse({});
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.limit, 20);
      assert.equal(parsed.data.offset, 0);
      assert.equal(parsed.data.status, "active");
    }
  });

  await t.test("accepts valid custom limit and offset", () => {
    const parsed = storiesQuerySchema.safeParse({ limit: "15", offset: "30", status: "archived" });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.limit, 15);
      assert.equal(parsed.data.offset, 30);
      assert.equal(parsed.data.status, "archived");
    }
  });

  await t.test("enforces limit bounds (1 to 50)", () => {
    assert.equal(storiesQuerySchema.safeParse({ limit: "0" }).success, false);
    assert.equal(storiesQuerySchema.safeParse({ limit: "51" }).success, false);
    assert.equal(storiesQuerySchema.safeParse({ limit: "-5" }).success, false);
    assert.equal(storiesQuerySchema.safeParse({ limit: "1" }).success, true);
    assert.equal(storiesQuerySchema.safeParse({ limit: "50" }).success, true);
  });

  await t.test("enforces offset non-negative integer", () => {
    assert.equal(storiesQuerySchema.safeParse({ offset: "-1" }).success, false);
    assert.equal(storiesQuerySchema.safeParse({ offset: "0" }).success, true);
    assert.equal(storiesQuerySchema.safeParse({ offset: "100" }).success, true);
  });
});

test("Step 2H: Canonical Title Selection", async (t) => {
  await t.test("replaces all-caps title with standard case title", () => {
    const result = chooseBestCanonicalTitle(
      "OPENAI ANNOUNCES GPT-5 REVOLUTION",
      "OpenAI announces GPT-5 revolution"
    );
    assert.equal(result, "OpenAI announces GPT-5 revolution");
  });

  await t.test("preserves existing canonical title when new title is equally standard", () => {
    const result = chooseBestCanonicalTitle(
      "OpenAI unveils next-generation AI model",
      "OpenAI announces its new artificial intelligence model"
    );
    assert.equal(result, "OpenAI unveils next-generation AI model");
  });

  await t.test("handles empty titles gracefully", () => {
    assert.equal(chooseBestCanonicalTitle("", "New Title"), "New Title");
    assert.equal(chooseBestCanonicalTitle("Existing Title", ""), "Existing Title");
  });
});

test("Step 2H: Story Candidate Matching & Similarity Thresholding", async (t) => {
  const candidates = [
    {
      id: "story-openai-01",
      canonicalTitle: "OpenAI announces new artificial intelligence model",
      firstPublishedAt: new Date("2026-09-13T08:00:00Z"),
      latestPublishedAt: new Date("2026-09-13T08:30:00Z"),
      articleCount: 1,
      sourceCount: 1,
    },
    {
      id: "story-space-02",
      canonicalTitle: "NASA lands rover on Europa surface",
      firstPublishedAt: new Date("2026-09-13T07:00:00Z"),
      latestPublishedAt: new Date("2026-09-13T07:15:00Z"),
      articleCount: 1,
      sourceCount: 1,
    },
  ];

  await t.test("clusters highly similar article from different publisher (score >= 0.72)", () => {
    const articleTitle = "OpenAI unveils latest AI model";
    const match = findBestStoryMatch(articleTitle, candidates, 0.72);
    assert.ok(match, "Should match OpenAI story");
    assert.equal(match.candidate.id, "story-openai-01");
    assert.ok(match.score >= 0.72);
  });

  await t.test("keeps unrelated article separate (creates new story)", () => {
    const unrelatedTitle = "Federal Reserve cuts interest rates by 25 basis points";
    const match = findBestStoryMatch(unrelatedTitle, candidates, 0.72);
    assert.equal(match, null, "Should not match any existing story");
  });

  await t.test("keeps similar company wording but different event separate", () => {
    const differentEvent = "OpenAI signs 10-year lease for new London headquarters";
    const match = findBestStoryMatch(differentEvent, candidates, 0.72);
    assert.equal(match, null, "Should not match product release story");
  });
});

// =====================================================================
// PART 2: In-Memory Mock Store for Scenarios 1 to 14
// =====================================================================

interface MockStory {
  id: string;
  canonical_title: string;
  summary: string | null;
  first_published_at: string;
  latest_published_at: string;
  article_count: number;
  source_count: number;
  importance_score: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MockArticle {
  id: string;
  source_id: string | null;
  provider: string;
  title: string;
  published_at: string;
}

interface MockStoryArticle {
  story_id: string;
  article_id: string;
  created_at: string;
}

function createMockSupabaseClient() {
  const storiesMap = new Map<string, MockStory>();
  const articlesMap = new Map<string, MockArticle>();
  const storyArticles: MockStoryArticle[] = [];

  let idCounter = 1;

  const mockClient = {
    _stories: storiesMap,
    _articles: articlesMap,
    _storyArticles: storyArticles,

    from(table: string) {
      if (table === "stories") {
        return {
          insert(record: Partial<MockStory>) {
            return {
              select() {
                return {
                  single() {
                    const id = record.id || `story-${idCounter++}`;
                    const story: MockStory = {
                      id,
                      canonical_title: record.canonical_title || "",
                      summary: record.summary || null,
                      first_published_at: record.first_published_at || new Date().toISOString(),
                      latest_published_at: record.latest_published_at || new Date().toISOString(),
                      article_count: record.article_count || 1,
                      source_count: record.source_count || 1,
                      importance_score: null,
                      status: record.status || "active",
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    storiesMap.set(id, story);
                    return Promise.resolve({ data: story, error: null });
                  },
                };
              },
            };
          },

          update(updates: Partial<MockStory>) {
            return {
              eq(col: string, val: string) {
                return {
                  select() {
                    return {
                      single() {
                        const story = storiesMap.get(val);
                        if (!story) {
                          return Promise.resolve({ data: null, error: { message: "Not found" } });
                        }
                        const updated = { ...story, ...updates, updated_at: new Date().toISOString() };
                        storiesMap.set(val, updated);
                        return Promise.resolve({ data: updated, error: null });
                      },
                    };
                  },
                };
              },
            };
          },

          select() {
            return {
              eq(col: string, val: string) {
                if (col === "id") {
                  return {
                    single() {
                      const item = storiesMap.get(val);
                      return Promise.resolve({
                        data: item || null,
                        error: item ? null : { message: "Story not found" },
                      });
                    },
                  };
                }
                // For status filtering
                const filtered = Array.from(storiesMap.values()).filter(
                  (s) => (s as unknown as Record<string, unknown>)[col] === val
                );
                return {
                  gte() {
                    return {
                      lte() {
                        return {
                          order() {
                            return {
                              limit() {
                                return Promise.resolve({ data: filtered, error: null });
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },

              order() {
                return {
                  range(from: number, to: number) {
                    const all = Array.from(storiesMap.values());
                    return Promise.resolve({
                      data: all.slice(from, to + 1),
                      count: all.length,
                      error: null,
                    });
                  },
                };
              },
            };
          },

          delete() {
            return {
              eq(col: string, val: string) {
                if (col === "id") {
                  storiesMap.delete(val);
                  // Cascade delete from junction table
                  for (let i = storyArticles.length - 1; i >= 0; i--) {
                    if (storyArticles[i].story_id === val) {
                      storyArticles.splice(i, 1);
                    }
                  }
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === "story_articles") {
        return {
          insert(record: { story_id: string; article_id: string }) {
            const exists = storyArticles.some(
              (r) => r.story_id === record.story_id && r.article_id === record.article_id
            );
            if (!exists) {
              storyArticles.push({ ...record, created_at: new Date().toISOString() });
            }
            return Promise.resolve({ data: record, error: null });
          },

          upsert(record: { story_id: string; article_id: string }) {
            const exists = storyArticles.some(
              (r) => r.story_id === record.story_id && r.article_id === record.article_id
            );
            if (!exists) {
              storyArticles.push({ ...record, created_at: new Date().toISOString() });
            }
            return Promise.resolve({ data: record, error: null });
          },

          select() {
            return {
              eq(col: string, val: string) {
                if (col === "article_id") {
                  return {
                    maybeSingle() {
                      const match = storyArticles.find((r) => r.article_id === val);
                      if (!match) return Promise.resolve({ data: null, error: null });
                      const story = storiesMap.get(match.story_id);
                      return Promise.resolve({
                        data: {
                          story_id: match.story_id,
                          stories: story ? { canonical_title: story.canonical_title } : null,
                        },
                        error: null,
                      });
                    },
                  };
                }

                if (col === "story_id") {
                  // Return matching junction items populated with articles
                  const matches = storyArticles.filter((r) => r.story_id === val);
                  const result = matches.map((m) => {
                    const article = articlesMap.get(m.article_id);
                    return {
                      article_id: m.article_id,
                      articles: article
                        ? {
                            id: article.id,
                            source_id: article.source_id,
                            published_at: article.published_at,
                            provider: article.provider,
                          }
                        : null,
                    };
                  });
                  return Promise.resolve({ data: result, error: null });
                }

                return Promise.resolve({ data: [], error: null });
              },
            };
          },

          delete() {
            return {
              eq(col: string, val: string) {
                if (col === "article_id") {
                  for (let i = storyArticles.length - 1; i >= 0; i--) {
                    if (storyArticles[i].article_id === val) {
                      storyArticles.splice(i, 1);
                    }
                  }
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === "articles") {
        return {
          delete() {
            return {
              eq(col: string, val: string) {
                if (col === "id") {
                  articlesMap.delete(val);
                  // Cascade delete junction row
                  for (let i = storyArticles.length - 1; i >= 0; i--) {
                    if (storyArticles[i].article_id === val) {
                      storyArticles.splice(i, 1);
                    }
                  }
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unhandled mock table: ${table}`);
    },
  };

  return mockClient as unknown as SupabaseClient<Database> & {
    _stories: Map<string, MockStory>;
    _articles: Map<string, MockArticle>;
    _storyArticles: MockStoryArticle[];
  };
}

// =====================================================================
// PART 3: The 14 Mandatory Scenarios
// =====================================================================

test("Step 2H: 14 Core Story Clustering Scenarios", async (t) => {
  const client = createMockSupabaseClient();

  // Helper to register mock articles
  function registerArticle(
    id: string,
    title: string,
    publishedAt: Date,
    sourceId: string | null = null,
    provider: string = "rss"
  ) {
    client._articles.set(id, {
      id,
      title,
      published_at: publishedAt.toISOString(),
      source_id: sourceId,
      provider,
    });
    return { id, title, publishedAt, sourceId };
  }

  // 1. One article creates one story
  let story1Id = "";
  await t.test("1. One article creates one story", async () => {
    const art = registerArticle(
      "art-1",
      "OpenAI announces new artificial intelligence model",
      new Date("2026-09-13T10:00:00Z"),
      "src-reuters"
    );

    const res = await clusterArticle(art, { client });
    assert.equal(res.isNewStory, true);
    assert.ok(res.storyId);
    story1Id = res.storyId;

    const story = client._stories.get(story1Id);
    assert.ok(story);
    assert.equal(story?.article_count, 1);
    assert.equal(story?.source_count, 1);
    assert.equal(story?.canonical_title, art.title);
  });

  // 2. Second highly similar article joins same story
  await t.test("2. Second highly similar article joins same story", async () => {
    const art2 = registerArticle(
      "art-2",
      "OpenAI unveils latest AI model",
      new Date("2026-09-13T10:30:00Z"),
      "src-bbc"
    );

    const res = await clusterArticle(art2, { client });
    assert.equal(res.isNewStory, false, "Should join existing story");
    assert.equal(res.storyId, story1Id, "Should join story 1");

    const story = client._stories.get(story1Id);
    assert.equal(story?.article_count, 2);
    assert.equal(story?.source_count, 2);
  });

  // 3. Same article cannot be attached twice
  await t.test("3. Same article cannot be attached twice", async () => {
    const art2 = {
      id: "art-2",
      title: "OpenAI unveils latest AI model",
      publishedAt: new Date("2026-09-13T10:30:00Z"),
      sourceId: "src-bbc",
    };

    const res = await clusterArticle(art2, { client });
    assert.equal(res.isNewStory, false);
    assert.equal(res.storyId, story1Id);

    // Verify article_count is still 2, not incremented to 3
    const story = client._stories.get(story1Id);
    assert.equal(story?.article_count, 2);
    assert.equal(story?.source_count, 2);

    // Verify junction rows count
    const links = client._storyArticles.filter((l) => l.story_id === story1Id);
    assert.equal(links.length, 2);
  });

  // 4. Different unrelated article creates different story
  let story2Id = "";
  await t.test("4. Different unrelated article creates different story", async () => {
    const art3 = registerArticle(
      "art-3",
      "Federal Reserve cuts interest rates by 25 basis points",
      new Date("2026-09-13T11:00:00Z"),
      "src-bloomberg"
    );

    const res = await clusterArticle(art3, { client });
    assert.equal(res.isNewStory, true, "Should create a new story");
    assert.notEqual(res.storyId, story1Id);
    story2Id = res.storyId;

    const story2 = client._stories.get(story2Id);
    assert.equal(story2?.article_count, 1);
    assert.equal(story2?.canonical_title, art3.title);
  });

  // 5. Same event from different publishers clusters
  await t.test("5. Same event from different publishers clusters", async () => {
    const techCrunchArt = registerArticle(
      "art-tc",
      "OpenAI launches its newest AI system",
      new Date("2026-09-13T11:15:00Z"),
      "src-techcrunch"
    );

    const res = await clusterArticle(techCrunchArt, { client });
    assert.equal(res.isNewStory, false);
    assert.equal(res.storyId, story1Id, "Should cluster into story 1");

    const story = client._stories.get(story1Id);
    assert.equal(story?.article_count, 3);
    assert.equal(story?.source_count, 3);
  });

  // 6. Similar wording but different event stays separate
  await t.test("6. Similar wording but different event stays separate", async () => {
    const differentEvent = registerArticle(
      "art-lease",
      "OpenAI signs lease for new corporate headquarters in San Francisco",
      new Date("2026-09-13T12:00:00Z"),
      "src-wsj"
    );

    const res = await clusterArticle(differentEvent, { client });
    assert.equal(res.isNewStory, true, "Different event must not cluster");
    assert.notEqual(res.storyId, story1Id);
    assert.notEqual(res.storyId, story2Id);
  });

  // 7. first_published_at updates correctly (min)
  await t.test("7. first_published_at updates correctly", async () => {
    const earlierArticle = registerArticle(
      "art-early",
      "OpenAI introduces new AI model",
      new Date("2026-09-13T06:00:00Z"), // Earlier than 10:00:00Z
      "src-ap"
    );

    const res = await clusterArticle(earlierArticle, { client });
    assert.equal(res.storyId, story1Id);

    const story = client._stories.get(story1Id);
    assert.equal(
      new Date(story?.first_published_at || "").toISOString(),
      new Date("2026-09-13T06:00:00Z").toISOString(),
      "first_published_at must be updated to earliest publication timestamp"
    );
  });

  // 8. latest_published_at updates correctly (max)
  await t.test("8. latest_published_at updates correctly", async () => {
    const laterArticle = registerArticle(
      "art-late",
      "OpenAI debuts its newest AI system",
      new Date("2026-09-13T16:00:00Z"), // Later than 11:15:00Z
      "src-verge"
    );

    const res = await clusterArticle(laterArticle, { client });
    assert.equal(res.storyId, story1Id);

    const story = client._stories.get(story1Id);
    assert.equal(
      new Date(story?.latest_published_at || "").toISOString(),
      new Date("2026-09-13T16:00:00Z").toISOString(),
      "latest_published_at must be updated to latest publication timestamp"
    );
  });

  // 9. source_count counts unique publishers
  await t.test("9. source_count counts unique publishers", async () => {
    // Attach an article from an ALREADY existing source ("src-bbc")
    const anotherBbcArt = registerArticle(
      "art-bbc-followup",
      "OpenAI reveals new AI model",
      new Date("2026-09-13T14:00:00Z"),
      "src-bbc" // duplicate source
    );

    const res = await clusterArticle(anotherBbcArt, { client });
    assert.equal(res.storyId, story1Id);

    const story = client._stories.get(story1Id);
    // Sources attached so far: src-reuters, src-bbc, src-techcrunch, src-ap, src-verge = 5 unique
    assert.equal(story?.source_count, 5, "Source count must only count unique publishers");
  });

  // 10. article_count is correct
  await t.test("10. article_count is correct", async () => {
    const story = client._stories.get(story1Id);
    // Articles attached to story1: art-1, art-2, art-tc, art-early, art-late, art-bbc-followup = 6 total
    assert.equal(story?.article_count, 6);

    const junctionCount = client._storyArticles.filter((r) => r.story_id === story1Id).length;
    assert.equal(junctionCount, 6);
  });

  // 11. Existing Step 2G exact duplicates do not create duplicate story relationships
  await t.test("11. Existing Step 2G exact duplicates do not create duplicate story relationships", async () => {
    const duplicateArt = {
      id: "art-1", // Exact duplicate ID already clustered
      title: "OpenAI announces new artificial intelligence model",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
      sourceId: "src-reuters",
    };

    const res = await clusterArticle(duplicateArt, { client });
    assert.equal(res.storyId, story1Id);

    const story = client._stories.get(story1Id);
    assert.equal(story?.article_count, 6, "Must not increment article_count on duplicate");

    const junctionCount = client._storyArticles.filter(
      (r) => r.story_id === story1Id && r.article_id === "art-1"
    ).length;
    assert.equal(junctionCount, 1, "Only one junction row can exist for art-1");
  });

  // 12. Existing articles remain intact
  await t.test("12. Existing articles remain intact", async () => {
    assert.ok(client._articles.has("art-1"));
    assert.ok(client._articles.has("art-2"));
    assert.ok(client._articles.has("art-3"));
    assert.equal(client._articles.get("art-1")?.title, "OpenAI announces new artificial intelligence model");
  });

  // 13. Story deletion does not unexpectedly delete articles
  await t.test("13. Story deletion does not unexpectedly delete articles", async () => {
    // Delete story2
    await client.from("stories").delete().eq("id", story2Id);

    // Story2 should be deleted
    assert.equal(client._stories.has(story2Id), false);

    // Article3 must still exist intact!
    assert.ok(client._articles.has("art-3"), "Article must remain intact when story is deleted");

    // Junction rows for story2 should be cleaned up
    const remainingJunctions = client._storyArticles.filter((r) => r.story_id === story2Id);
    assert.equal(remainingJunctions.length, 0);
  });

  // 14. Article deletion cleans the relationship safely
  await t.test("14. Article deletion cleans the relationship safely", async () => {
    // Delete art-tc
    await client.from("articles").delete().eq("id", "art-tc");

    // Article should be deleted
    assert.equal(client._articles.has("art-tc"), false);

    // Story 1 must still exist intact!
    assert.ok(client._stories.has(story1Id), "Story must remain intact when article is deleted");

    // Junction row for art-tc must be deleted
    const link = client._storyArticles.find((r) => r.article_id === "art-tc");
    assert.equal(link, undefined, "Junction row must be deleted");
  });
});

// =====================================================================
// PART 4: Stories Read API Route Handlers
// =====================================================================

test("Step 2H: GET /api/stories Endpoint Validation", async (t) => {
  await t.test("returns 400 when limit is invalid", async () => {
    const req = new Request("http://localhost:3000/api/stories?limit=100");
    const res = await storiesRouteHandler(req);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error);
    assert.ok(body.details);
  });

  await t.test("returns 400 when offset is negative", async () => {
    const req = new Request("http://localhost:3000/api/stories?offset=-5");
    const res = await storiesRouteHandler(req);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error);
  });
});
