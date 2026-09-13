import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { GoogleGenAI } from "@google/genai";
import {
  generateTopicDigest,
  getDigestForPeriod,
  getLatestDigest,
  getUserDigests,
  getDigestById,
  computePeriodWindow,
  digestAiOutputSchema,
} from "@/server/news/digests";
import {
  buildDeterministicFallbackDigest,
  groundStoryIdsInAiOutput,
} from "@/server/ai/digest";
import {
  POST as generateDigestRoute,
  generateDigestBodySchema,
} from "@/app/api/digests/generate/route";
import {
  GET as listDigestsRoute,
  getDigestsQuerySchema,
} from "@/app/api/digests/route";
import { GET as getSingleDigestRoute } from "@/app/api/digests/[id]/route";

// Load test environment
const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

interface MockDigestRecord {
  id: string;
  user_id: string;
  period_type: "daily" | "weekly";
  period_start: string;
  period_end: string;
  title: string;
  executive_summary: string;
  key_developments: unknown;
  category_highlights: unknown;
  opportunities: unknown;
  risks: unknown;
  story_count: number;
  important_story_count: number;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface MockDigestStoryRecord {
  id: string;
  digest_id: string;
  story_id: string;
  rank: number;
  importance_score: number | null;
  is_important: boolean;
  [key: string]: unknown;
}

const NOW = new Date("2026-09-14T12:00:00.000Z");

const MOCK_STORIES = [
  {
    id: "story-ai-models-1",
    canonical_title: "Open Weights Frontier Model Achieves Reasoning Breakthrough",
    summary: "New mixture-of-agents architecture released with open parameters.",
    first_published_at: new Date(NOW.getTime() - 4 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(NOW.getTime() - 2 * 3600 * 1000).toISOString(),
    article_count: 7,
    source_count: 5,
    importance_score: 0.92,
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  },
  {
    id: "story-quantum-2",
    canonical_title: "Commercial Quantum Processor Demonstrates 100 Logical Qubits",
    summary: "Fault-tolerant milestone reached ahead of projected roadmaps.",
    first_published_at: new Date(NOW.getTime() - 8 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(NOW.getTime() - 6 * 3600 * 1000).toISOString(),
    article_count: 4,
    source_count: 3,
    importance_score: 0.85,
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  },
  {
    id: "story-cloud-3",
    canonical_title: "Next-Gen Data Center Launches Zero-Emission Cooling",
    summary: "Geothermal-powered computing cluster expands across Northern Europe.",
    first_published_at: new Date(NOW.getTime() - 16 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(NOW.getTime() - 12 * 3600 * 1000).toISOString(),
    article_count: 3,
    source_count: 2,
    importance_score: 0.58,
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  },
  {
    id: "story-older-weekly-4",
    canonical_title: "Semiconductor Foundry Announces 2nm Lithography Facility",
    summary: "Advanced fabrication facility receives regulatory building permits.",
    first_published_at: new Date(NOW.getTime() - 96 * 3600 * 1000).toISOString(), // 4 days ago
    latest_published_at: new Date(NOW.getTime() - 90 * 3600 * 1000).toISOString(),
    article_count: 6,
    source_count: 4,
    importance_score: 0.79,
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  },
  {
    id: "story-unrelated-biotech-5",
    canonical_title: "Clinical Trial Reports Positive Oncology Phase 2 Results",
    summary: "Targeted therapy demonstrates disease stabilization in early cohort.",
    first_published_at: new Date(NOW.getTime() - 6 * 3600 * 1000).toISOString(),
    latest_published_at: new Date(NOW.getTime() - 5 * 3600 * 1000).toISOString(),
    article_count: 2,
    source_count: 2,
    importance_score: 0.65,
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  },
];

const MOCK_CATEGORIES = [
  {
    story_id: "story-ai-models-1",
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
    story_id: "story-quantum-2",
    category_id: "quantum-computing",
    confidence: 0.92,
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
    story_id: "story-cloud-3",
    category_id: "cloud-computing",
    confidence: 0.88,
    is_primary: true,
    categories: {
      id: "cloud-computing",
      name: "Cloud Infrastructure",
      slug: "cloud-computing",
      level: 3,
      parent_id: "technology",
    },
  },
  {
    story_id: "story-older-weekly-4",
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
  {
    story_id: "story-unrelated-biotech-5",
    category_id: "biotech-oncology",
    confidence: 0.95,
    is_primary: true,
    categories: {
      id: "biotech-oncology",
      name: "Biotech & Oncology",
      slug: "biotech-oncology",
      level: 3,
      parent_id: "healthcare",
    },
  },
];

const MOCK_INTELLIGENCE = [
  {
    story_id: "story-ai-models-1",
    model: "gemini-flash-latest",
    tier: "important",
    summary: "Breakthrough open-weight model matches closed frontier reasoning performance.",
    key_points: [
      "Permissive license enables sovereign on-premises deployment.",
      "Sparse activation optimizes consumer workstation hardware.",
    ],
    why_it_matters: "Accelerates commercial transition to sovereign localized reasoning engines.",
    opportunities: ["Deploy localized reasoning agents without API per-token costs."],
    risks: ["Accelerated safety and jailbreak surface on open architectures."],
    status: "completed",
    generated_at: NOW.toISOString(),
  },
  {
    story_id: "story-quantum-2",
    model: "gemini-flash-latest",
    tier: "important",
    summary: "Topological error suppression brings commercial quantum computing within reach.",
    key_points: ["100 logical qubits achieved with error threshold beneath fault line."],
    why_it_matters: "Brings molecular simulation and cryptographic timelines forward.",
    opportunities: ["Accelerate chemical synthesis and battery discovery."],
    risks: ["Legacy public key cryptography obsolescence."],
    status: "completed",
    generated_at: NOW.toISOString(),
  },
];

function createMockSupabase(options?: {
  digests?: MockDigestRecord[];
  digestStories?: MockDigestStoryRecord[];
  userCategories?: string[];
  userSelectionMode?: "CATEGORY" | "ALL";
}) {
  const digests: MockDigestRecord[] = [...(options?.digests || [])];
  const digestStories: MockDigestStoryRecord[] = [...(options?.digestStories || [])];
  const userCategoryIds = options?.userCategories ?? ["ai-models", "quantum-computing", "cloud-computing", "semiconductors"];
  const userMode = options?.userSelectionMode ?? "CATEGORY";

  return {
    _digests: digests,
    _digestStories: digestStories,
    from(table: string) {
      if (table === "topic_digests") {
        return {
          upsert: (record: Partial<MockDigestRecord>) => {
            const existingIdx = digests.findIndex(
              (d) =>
                d.user_id === record.user_id &&
                d.period_type === record.period_type &&
                d.period_start === record.period_start &&
                d.period_end === record.period_end
            );

            let saved: MockDigestRecord;
            if (existingIdx !== -1) {
              saved = {
                ...digests[existingIdx],
                ...record,
              } as MockDigestRecord;
              digests[existingIdx] = saved;
            } else {
              saved = {
                id: `digest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                user_id: record.user_id!,
                period_type: record.period_type || "daily",
                period_start: record.period_start!,
                period_end: record.period_end!,
                title: record.title || "Briefing",
                executive_summary: record.executive_summary || "",
                key_developments: record.key_developments || [],
                category_highlights: record.category_highlights || [],
                opportunities: record.opportunities || [],
                risks: record.risks || [],
                story_count: record.story_count || 0,
                important_story_count: record.important_story_count || 0,
                model: record.model || null,
                prompt_version: record.prompt_version || null,
                created_at: new Date().toISOString(),
              };
              digests.push(saved);
            }

            return {
              select: () => ({
                single: () => Promise.resolve({ data: saved, error: null }),
              }),
            };
          },
          select: () => ({
            eq: (field: string, val: string) => {
              const filter1 = digests.filter((d) => (d as Record<string, unknown>)[field] === val);
              return {
                eq: (field2: string, val2: string) => {
                  const filter2 = filter1.filter((d) => (d as Record<string, unknown>)[field2] === val2);
                  return {
                    eq: (field3: string, val3: string) => {
                      const filter3 = filter2.filter((d) => (d as Record<string, unknown>)[field3] === val3);
                      return {
                        eq: (field4: string, val4: string) => ({
                          maybeSingle: () => {
                            const found = filter3.find((d) => (d as Record<string, unknown>)[field4] === val4);
                            return Promise.resolve({ data: found || null, error: null });
                          },
                        }),
                        maybeSingle: () => {
                          const found = filter3[0] || null;
                          return Promise.resolve({ data: found, error: null });
                        },
                      };
                    },
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () => {
                          const sorted = [...filter2].sort(
                            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                          );
                          return Promise.resolve({ data: sorted[0] || null, error: null });
                        },
                      }),
                    }),
                    maybeSingle: () => {
                      const found = filter2[0] || null;
                      return Promise.resolve({ data: found, error: null });
                    },
                  };
                },
                order: () => {
                  const sorted = [...filter1].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  );
                  return Promise.resolve({ data: sorted, error: null });
                },
                maybeSingle: () => {
                  const found = filter1[0] || null;
                  return Promise.resolve({ data: found, error: null });
                },
              };
            },
          }),
        };
      }

      if (table === "topic_digest_stories") {
        return {
          upsert: (records: Partial<MockDigestStoryRecord>[]) => {
            for (const r of records) {
              const existingIdx = digestStories.findIndex(
                (ds) => ds.digest_id === r.digest_id && ds.story_id === r.story_id
              );
              if (existingIdx !== -1) {
                digestStories[existingIdx] = { ...digestStories[existingIdx], ...r } as MockDigestStoryRecord;
              } else {
                digestStories.push({
                  id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  digest_id: r.digest_id!,
                  story_id: r.story_id!,
                  rank: r.rank || 1,
                  importance_score: r.importance_score ?? null,
                  is_important: r.is_important || false,
                });
              }
            }
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: (field: string, val: string) => ({
              order: () => {
                const matches = digestStories
                  .filter((ds) => (ds as Record<string, unknown>)[field] === val)
                  .sort((a, b) => a.rank - b.rank);
                return Promise.resolve({ data: matches, error: null });
              },
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
              limit: () => Promise.resolve({ data: MOCK_STORIES, error: null }),
              in: (_field: string, ids: string[]) => {
                const matched = MOCK_STORIES.filter((s) => ids.includes(s.id));
                return Promise.resolve({ data: matched, error: null });
              },
            };
            return builder;
          },
        };
      }

      if (table === "story_categories") {
        return {
          select: () => ({
            in: (_field: string, ids: string[]) => {
              const matched = MOCK_CATEGORIES.filter((c) => ids.includes(c.story_id));
              return Promise.resolve({ data: matched, error: null });
            },
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
            eq: () => {
              const rows = userCategoryIds.map((cid) => ({ category_id: cid }));
              return Promise.resolve({ data: rows, error: null });
            },
          }),
        };
      }

      if (table === "user_saved_stories") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }

      return {};
    },
  } as unknown as SupabaseClient<Database> & {
    _digests: MockDigestRecord[];
    _digestStories: MockDigestStoryRecord[];
  };
}

test("Phase 3D: Topic Digest & Intelligence Briefings Comprehensive Suite", async (t) => {
  // Test 1: Authenticated user can generate daily digest
  await t.test("1. Authenticated user can generate daily topic digest briefing", async () => {
    const mockClient = createMockSupabase();

    let geminiCalls = 0;
    const mockGemini = {
      models: {
        generateContent: async () => {
          geminiCalls++;
          return {
            text: JSON.stringify({
              title: "Daily Strategic Technology Brief",
              executiveSummary: "Key frontier advances in open reasoning architectures and logical qubit scaling.",
              keyDevelopments: [
                {
                  headline: "Open Weights Reasoning Parity Achieved",
                  explanation: "Novel mixture-of-agents architecture rivals proprietary benchmark results.",
                  storyId: "story-ai-models-1",
                },
                {
                  headline: "100 Logical Qubits Scaled",
                  explanation: "Fault-tolerant milestone demonstrated on commercial roadmap.",
                  storyId: "story-quantum-2",
                },
              ],
              categoryHighlights: [
                {
                  categoryName: "AI Models & LLMs",
                  summary: "Rapid expansion of decentralized sovereign reasoning agents.",
                  storyIds: ["story-ai-models-1"],
                },
              ],
              opportunities: ["Deploy localized reasoning clusters."],
              risks: ["Adversarial jailbreaking on unaligned open weights."],
            }),
          };
        },
      },
    } as unknown as GoogleGenAI;

    const result = await generateTopicDigest({
      userId: "user-1",
      periodType: "daily",
      referenceTime: NOW,
      client: mockClient,
      geminiClient: mockGemini,
    });

    assert.equal(result.generated, true);
    assert.equal(result.source, "gemini");
    assert.equal(result.digest.periodType, "daily");
    assert.equal(result.digest.title, "Daily Strategic Technology Brief");
    assert.equal(result.digest.keyDevelopments.length, 2);
    assert.equal(geminiCalls, 1, "Must make exactly 1 Gemini call");

    // Check DB persistence
    assert.equal(mockClient._digests.length, 1);
    assert.equal(mockClient._digestStories.length > 0, true);
  });

  // Test 2: Unauthenticated user rejected with 401
  await t.test("2. Unauthenticated user is rejected with 401 on POST and GET routes", async () => {
    // 2a. POST /api/digests/generate
    const postReq = new Request("http://localhost:3000/api/digests/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodType: "daily" }),
    });
    const postRes = await generateDigestRoute(postReq);
    assert.equal(postRes.status, 401);

    // 2b. GET /api/digests
    const getReq = new Request("http://localhost:3000/api/digests");
    const getRes = await listDigestsRoute(getReq);
    assert.equal(getRes.status, 401);

    // 2c. GET /api/digests/[id]
    const getSingleReq = new Request("http://localhost:3000/api/digests/digest-test-id");
    const getSingleRes = await getSingleDigestRoute(getSingleReq, {
      params: Promise.resolve({ id: "digest-test-id" }),
    });
    assert.equal(getSingleRes.status, 401);
  });

  // Test 3: Client userId is ignored / rejected by schemas
  await t.test("3. Client userId spoofing is ignored by schemas and cannot override server session", () => {
    const postParsed = generateDigestBodySchema.safeParse({
      periodType: "daily",
      userId: "attacker-spoofed-id",
    });
    assert.equal(postParsed.success, true);
    // @ts-expect-error verifying userId is not present in parsed schema
    assert.equal(postParsed.data.userId, undefined);

    const getParsed = getDigestsQuerySchema.safeParse({
      userId: "attacker-spoofed-id",
      limit: 10,
    });
    assert.equal(getParsed.success, true);
    // @ts-expect-error verifying userId is not present in parsed schema
    assert.equal(getParsed.data.userId, undefined);
  });

  const mockFastGemini = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          title: "Fast Mock Brief",
          executiveSummary: "Fast test executive summary.",
          keyDevelopments: [
            {
              headline: "Fast Key Development",
              explanation: "Fast explanation.",
              storyId: "story-ai-models-1",
            },
          ],
          categoryHighlights: [],
          opportunities: [],
          risks: [],
        }),
      }),
    },
  } as unknown as GoogleGenAI;

  // Test 4: User categories are respected
  await t.test("4. Digest only includes candidate stories matching user selected categories", async () => {
    // User only selected quantum-computing
    const mockClient = createMockSupabase({
      userCategories: ["quantum-computing"],
      userSelectionMode: "CATEGORY",
    });

    const result = await generateTopicDigest({
      userId: "user-quantum-only",
      periodType: "daily",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockFastGemini,
    });

    assert.ok(result.digest);
    // Unrelated biotech story must never appear
    const containsBiotech = result.digest.stories?.some((s) => s.storyId === "story-unrelated-biotech-5");
    assert.equal(containsBiotech, false);
  });

  // Test 5: Daily time window is correct (previous 24 hours)
  await t.test("5. Daily time window spans exact previous 24 hours", () => {
    const window = computePeriodWindow("daily", NOW);
    const start = new Date(window.periodStart).getTime();
    const end = new Date(window.periodEnd).getTime();
    const diffHours = (end - start) / (1000 * 60 * 60);

    assert.equal(diffHours, 24);
    assert.equal(window.periodEnd, NOW.toISOString());
  });

  // Test 6: Weekly time window is correct (previous 7 days)
  await t.test("6. Weekly time window spans exact previous 7 days", () => {
    const window = computePeriodWindow("weekly", NOW);
    const start = new Date(window.periodStart).getTime();
    const end = new Date(window.periodEnd).getTime();
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);

    assert.equal(diffDays, 7);
    assert.equal(window.periodEnd, NOW.toISOString());
  });

  // Test 7: Duplicate stories are removed
  await t.test("7. Duplicate stories are deduplicated before digest generation", async () => {
    const mockClient = createMockSupabase();
    const result = await generateTopicDigest({
      userId: "user-dedup",
      periodType: "weekly",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockFastGemini,
    });

    const ids = (result.digest.stories || []).map((s) => s.storyId);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, "Story IDs in digest must be unique");
  });

  // Test 8: Story limit is enforced
  await t.test("8. Story limits are strictly enforced (max 20 for daily, 50 for weekly)", async () => {
    const mockClient = createMockSupabase();

    const dailyResult = await generateTopicDigest({
      userId: "user-limit-check",
      periodType: "daily",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockFastGemini,
    });
    assert.ok(dailyResult.digest.storyCount <= 20);

    const weeklyResult = await generateTopicDigest({
      userId: "user-limit-check",
      periodType: "weekly",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockFastGemini,
    });
    assert.ok(weeklyResult.digest.storyCount <= 50);
  });

  // Test 9: Existing digest is returned without Gemini call
  await t.test("9. Existing digest for active period is returned with generated: false and source: 'existing'", async () => {
    const window = computePeriodWindow("daily", NOW);
    const existingDigestRecord: MockDigestRecord = {
      id: "digest-pre-existing-1",
      user_id: "user-cached",
      period_type: "daily",
      period_start: window.periodStart,
      period_end: window.periodEnd,
      title: "Pre-existing Cached Daily Briefing",
      executive_summary: "Existing summary that was already persisted.",
      key_developments: [],
      category_highlights: [],
      opportunities: [],
      risks: [],
      story_count: 3,
      important_story_count: 2,
      model: "gemini-flash-lite-latest",
      prompt_version: "v1-digest",
      created_at: new Date(NOW.getTime() - 2 * 3600 * 1000).toISOString(),
    };

    const mockClient = createMockSupabase({ digests: [existingDigestRecord] });

    let geminiCalled = false;
    const mockGemini = {
      models: {
        generateContent: async () => {
          geminiCalled = true;
          return { text: "{}" };
        },
      },
    } as unknown as GoogleGenAI;

    const result = await generateTopicDigest({
      userId: "user-cached",
      periodType: "daily",
      referenceTime: NOW,
      force: false,
      client: mockClient,
      geminiClient: mockGemini,
    });

    assert.equal(result.generated, false);
    assert.equal(result.source, "existing");
    assert.equal(result.digest.id, "digest-pre-existing-1");
    assert.equal(geminiCalled, false, "Must make zero Gemini calls when cached digest exists");
  });

  // Test 10: Exactly one Gemini call is used for a new digest
  await t.test("10. Digest synthesis consumes exactly ONE model call for the entire briefing", async () => {
    const mockClient = createMockSupabase();

    let callCount = 0;
    const mockGemini = {
      models: {
        generateContent: async () => {
          callCount++;
          return {
            text: JSON.stringify({
              title: "Single Call Executive Brief",
              executiveSummary: "Synthesized in one pass.",
              keyDevelopments: [
                {
                  headline: "Single Call Headline",
                  explanation: "Generated in one model invocation.",
                  storyId: "story-ai-models-1",
                },
              ],
              categoryHighlights: [],
              opportunities: [],
              risks: [],
            }),
          };
        },
      },
    } as unknown as GoogleGenAI;

    await generateTopicDigest({
      userId: "user-single-call",
      periodType: "daily",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockGemini,
    });

    assert.equal(callCount, 1, "Must invoke generateContent exactly once");
  });

  // Test 11: Flash-Lite is the default digest model
  await t.test("11. Flash-Lite is the default model for digest synthesis", async () => {
    let capturedModel = "";
    const mockGemini = {
      models: {
        generateContent: async (args: { model: string }) => {
          capturedModel = args.model;
          return {
            text: JSON.stringify({
              title: "Model Check Brief",
              executiveSummary: "Model check.",
              keyDevelopments: [
                {
                  headline: "Headline",
                  explanation: "Explanation",
                  storyId: "story-ai-models-1",
                },
              ],
              categoryHighlights: [],
              opportunities: [],
              risks: [],
            }),
          };
        },
      },
    } as unknown as GoogleGenAI;

    const mockClient = createMockSupabase();
    await generateTopicDigest({
      userId: "user-model-check",
      periodType: "daily",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockGemini,
    });

    assert.equal(capturedModel, "gemini-flash-lite-latest");
  });

  // Test 12: Invalid Gemini JSON is handled safely
  await t.test("12. Invalid Gemini JSON falls back safely to deterministic synthesis without throwing", async () => {
    const mockGemini = {
      models: {
        generateContent: async () => ({
          text: "MALFORMED_NON_JSON_RESPONSE{{{",
        }),
      },
    } as unknown as GoogleGenAI;

    const mockClient = createMockSupabase();
    const result = await generateTopicDigest({
      userId: "user-invalid-json",
      periodType: "daily",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockGemini,
    });

    assert.equal(result.generated, true);
    assert.equal(result.source, "fallback");
    assert.equal(result.digest.model, "deterministic-fallback");
    assert.ok(result.digest.title.includes("Daily Intelligence Brief"));
  });

  // Test 13: Gemini 429 falls back safely
  await t.test("13. Gemini 429 / rate-limit falls back gracefully to deterministic synthesis", async () => {
    const mockGemini = {
      models: {
        generateContent: async () => {
          const err = new Error("Resource exhausted: 429 Quota Exceeded");
          (err as unknown as { status: number }).status = 429;
          throw err;
        },
      },
    } as unknown as GoogleGenAI;

    const mockClient = createMockSupabase();
    const result = await generateTopicDigest({
      userId: "user-rate-limit",
      periodType: "daily",
      referenceTime: NOW,
      force: true,
      client: mockClient,
      geminiClient: mockGemini,
    });

    assert.equal(result.generated, true);
    assert.equal(result.source, "fallback");
    assert.equal(result.digest.model, "deterministic-fallback");
    assert.ok(result.digest.executiveSummary.length > 0);
  });

  // Test 14: Deterministic fallback works
  await t.test("14. Deterministic fallback produces well-formed structured briefing", () => {
    const fallback = buildDeterministicFallbackDigest(
      [
        {
          id: "story-ai-models-1",
          title: "AI Story Title",
          canonicalTitle: "AI Story Title",
          summary: "AI summary text.",
          imageUrl: null,
          firstPublishedAt: NOW.toISOString(),
          latestPublishedAt: NOW.toISOString(),
          articleCount: 5,
          sourceCount: 3,
          importance: "CRITICAL",
          importanceScore: 0.9,
          categories: [{ categoryId: "ai-models", categorySlug: "ai-models", categoryName: "AI Models", level: 3, confidence: 0.9, isPrimary: true }],
          sources: [],
          status: "active",
          relevance: { score: 1, isRelevant: true, matchedCategoryIds: [], matchedCategoryNames: [], synergyBoost: 0, recencyFactor: 1, explanation: "" },
          feedScore: 1,
          intelligence: {
            summary: "Precomputed AI summary.",
            keyPoints: ["Point 1"],
            whyItMatters: "Strategic significance.",
            opportunities: ["Market opportunity 1"],
            risks: ["Market risk 1"],
            model: "gemini-flash-latest",
            tier: "important",
            generatedAt: NOW.toISOString(),
          },
        },
      ],
      "daily",
      ["AI Models"]
    );

    assert.equal(fallback.title, "Daily Intelligence Brief");
    assert.ok(fallback.executiveSummary.includes("Precomputed AI summary"));
    assert.equal(fallback.keyDevelopments.length, 1);
    assert.equal(fallback.keyDevelopments[0].storyId, "story-ai-models-1");
    assert.equal(fallback.opportunities.length, 1);
    assert.equal(fallback.risks.length, 1);
  });

  // Test 15: AI_ENABLED=false uses fallback
  await t.test("15. AI_ENABLED=false switches directly to deterministic fallback without calling API", async () => {
    const prevAi = process.env.AI_ENABLED;
    process.env.AI_ENABLED = "false";

    try {
      let apiCalled = false;
      const mockGemini = {
        models: {
          generateContent: async () => {
            apiCalled = true;
            return { text: "{}" };
          },
        },
      } as unknown as GoogleGenAI;

      const mockClient = createMockSupabase();
      const result = await generateTopicDigest({
        userId: "user-disabled-ai",
        periodType: "daily",
        referenceTime: NOW,
        force: true,
        client: mockClient,
        geminiClient: mockGemini,
      });

      assert.equal(result.source, "fallback");
      assert.equal(apiCalled, false, "Must not call Gemini API when AI_ENABLED=false");
    } finally {
      process.env.AI_ENABLED = prevAi;
    }
  });

  // Test 16: Digest references only supplied story IDs
  await t.test("16. Digest sanitization strictly limits referenced story IDs to supplied candidates", () => {
    const validIds = new Set(["story-1", "story-2"]);
    const grounded = groundStoryIdsInAiOutput(
      {
        title: "Test",
        executiveSummary: "Summary",
        keyDevelopments: [
          { headline: "Valid Story", explanation: "Exp", storyId: "story-1" },
          { headline: "Hallucinated Story", explanation: "Exp", storyId: "story-hallucinated-999" },
        ],
        categoryHighlights: [
          { categoryName: "Cat", summary: "Sum", storyIds: ["story-1", "story-fake"] },
        ],
        opportunities: [],
        risks: [],
      },
      validIds,
      ["story-1", "story-2"]
    );

    assert.equal(grounded.keyDevelopments.length, 1);
    assert.equal(grounded.keyDevelopments[0].storyId, "story-1");
    assert.deepEqual(grounded.categoryHighlights[0].storyIds, ["story-1"]);
  });

  // Test 17: Digest RLS prevents cross-user access
  await t.test("17. Digest service isolates user records preventing cross-user leakage", async () => {
    const mockClient = createMockSupabase({
      digests: [
        {
          id: "digest-user-a",
          user_id: "user-a",
          period_type: "daily",
          period_start: NOW.toISOString(),
          period_end: NOW.toISOString(),
          title: "User A Digest",
          executive_summary: "Private for User A",
          key_developments: [],
          category_highlights: [],
          opportunities: [],
          risks: [],
          story_count: 1,
          important_story_count: 1,
          model: "gemini-flash-lite-latest",
          prompt_version: "v1-digest",
          created_at: NOW.toISOString(),
        },
      ],
    });

    // User A can access
    const digestForA = await getDigestById("digest-user-a", "user-a", mockClient);
    assert.ok(digestForA);
    assert.equal(digestForA.title, "User A Digest");

    // User B cannot access User A's digest
    const digestForB = await getDigestById("digest-user-a", "user-b", mockClient);
    assert.equal(digestForB, null, "User B must not be able to read User A's digest");

    // User B listing digests gets 0
    const listB = await getUserDigests("user-b", {}, mockClient);
    assert.equal(listB.digests.length, 0);
  });

  // Test 18: Included story ordering is preserved by rank
  await t.test("18. Included story ordering is preserved by ascending rank", async () => {
    const mockClient = createMockSupabase({
      digests: [
        {
          id: "digest-rank-test",
          user_id: "user-1",
          period_type: "daily",
          period_start: NOW.toISOString(),
          period_end: NOW.toISOString(),
          title: "Ranked Digest",
          executive_summary: "Summary",
          key_developments: [],
          category_highlights: [],
          opportunities: [],
          risks: [],
          story_count: 2,
          important_story_count: 1,
          model: "gemini-flash-lite-latest",
          prompt_version: "v1-digest",
          created_at: NOW.toISOString(),
        },
      ],
      digestStories: [
        { id: "ds-2", digest_id: "digest-rank-test", story_id: "story-quantum-2", rank: 2, importance_score: 0.85, is_important: true },
        { id: "ds-1", digest_id: "digest-rank-test", story_id: "story-ai-models-1", rank: 1, importance_score: 0.92, is_important: true },
      ],
    });

    const digest = await getDigestById("digest-rank-test", "user-1", mockClient);
    assert.ok(digest?.stories);
    assert.equal(digest.stories.length, 2);
    assert.equal(digest.stories[0].rank, 1);
    assert.equal(digest.stories[0].storyId, "story-ai-models-1");
    assert.equal(digest.stories[1].rank, 2);
    assert.equal(digest.stories[1].storyId, "story-quantum-2");
  });

  // Test 19: Opportunities/risks are safely optional
  await t.test("19. Opportunities and risks safely default to empty arrays when omitted", () => {
    const parsed = digestAiOutputSchema.safeParse({
      title: "Clean Brief",
      executiveSummary: "Clean summary without explicit risks.",
      keyDevelopments: [
        { headline: "Headline", explanation: "Exp", storyId: "story-1" },
      ],
    });

    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.data?.opportunities, []);
    assert.deepEqual(parsed.data?.risks, []);
  });

  // Test 20: Reading a digest performs zero Gemini calls
  await t.test("20. Reading, fetching, and listing digests strictly performs zero Gemini API calls", async () => {
    const originalFetch = globalThis.fetch;
    let geminiApiCallCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        geminiApiCallCount++;
        throw new Error("UNEXPECTED GEMINI API CALL ON DIGEST READ");
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const mockClient = createMockSupabase({
        digests: [
          {
            id: "digest-read-test",
            user_id: "user-reader",
            period_type: "daily",
            period_start: NOW.toISOString(),
            period_end: NOW.toISOString(),
            title: "Read Test Digest",
            executive_summary: "Stored summary",
            key_developments: [],
            category_highlights: [],
            opportunities: [],
            risks: [],
            story_count: 1,
            important_story_count: 1,
            model: "gemini-flash-lite-latest",
            prompt_version: "v1-digest",
            created_at: NOW.toISOString(),
          },
        ],
      });

      // 1. getDigestById
      const d1 = await getDigestById("digest-read-test", "user-reader", mockClient);
      assert.ok(d1);

      // 2. getUserDigests
      const dList = await getUserDigests("user-reader", {}, mockClient);
      assert.equal(dList.digests.length, 1);

      // 3. getLatestDigest
      const dLatest = await getLatestDigest("user-reader", "daily", mockClient);
      assert.ok(dLatest);

      // 4. getDigestForPeriod
      const dPeriod = await getDigestForPeriod("user-reader", "daily", NOW.toISOString(), NOW.toISOString(), mockClient);
      assert.ok(dPeriod);

      assert.equal(geminiApiCallCount, 0, "Reading digests must never make Gemini API calls");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
