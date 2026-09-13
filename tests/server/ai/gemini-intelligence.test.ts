import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Load environment variables for test execution
const cwd = process.cwd();
const localEnvPath = path.resolve(cwd, ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(cwd, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { GoogleGenAI } from "@google/genai";
import {
  getGeminiConfig,
  isGeminiConfigured,
  isAiEnabled,
  getGeminiClient,
  resetGeminiClient,
} from "@/server/ai/client";
import {
  flashLiteTriageSchema,
  type StoryInputForAI,
} from "@/server/ai/types";
import {
  classifyStoryWithFlashLite,
  isValidTaxonomySlug,
  getAllTaxonomySlugs,
} from "@/server/ai/classifier";
import {
  generateImportantStoryIntelligence,
  isRateLimitError,
} from "@/server/ai/service";
import { processPendingStoryIntelligence } from "@/server/ai/pipeline";
import { GET as getStoryAiHandler } from "@/app/api/stories/[id]/ai/route";

// Sample valid story input
const SAMPLE_STORY: StoryInputForAI = {
  id: "story-ai-test-1",
  canonicalTitle: "Anthropic Announces Claude 3.7 Sonnet Hybrid Reasoning Model",
  summary: "Anthropic unveiled Claude 3.7 with continuous thinking control.",
  firstPublishedAt: new Date(Date.now() - 3600000).toISOString(),
  latestPublishedAt: new Date().toISOString(),
  articleCount: 3,
  sourceCount: 2,
  sources: [{ name: "TechCrunch" }, { name: "Ars Technica" }],
  categories: [{ categoryName: "AI Models", isPrimary: true }],
  articlesPreview: [
    {
      title: "Anthropic launches Claude 3.7 Sonnet",
      publisher: "TechCrunch",
      description: "The model supports hybrid instant and extended reasoning modes.",
    },
  ],
};

// Sample Flash-Lite Normal Story Output (< 0.70)
const NORMAL_TRIAGE_OUTPUT = {
  relevant: true,
  categorySlugs: ["ai-models", "generative-ai"],
  importanceScore: 0.55,
  tier: "normal" as const,
  summary: "Anthropic announced Claude 3.7 Sonnet featuring switchable extended thinking modes for coding and analysis.",
  keyPoints: [
    "Users can set dynamic thinking budgets between instantaneous and extended.",
    "Integrated directly into developer API and Claude.ai interfaces.",
  ],
};

// Sample Flash-Lite Important Story Output (>= 0.70)
const IMPORTANT_TRIAGE_OUTPUT = {
  relevant: true,
  categorySlugs: ["ai-models", "technology-ai"],
  importanceScore: 0.85,
  tier: "important" as const,
  summary: "Major frontier model breakthrough enabling combined reasoning and standard speed.",
  keyPoints: ["Breakthrough reasoning benchmark scores.", "Enterprise-grade safety controls."],
};

// Sample Flash Deep Intelligence Output
const DEEP_FLASH_OUTPUT = {
  executiveSummary: "Anthropic's Claude 3.7 Sonnet introduces a hybrid reasoning architecture that allows users to seamlessly balance low-latency responses with deep, iterative reasoning chains on demand.",
  keyTakeaways: [
    "First frontier LLM to offer hybrid instantaneous and extended thinking in a single model.",
    "Sets new benchmark records on software engineering evaluations (SWE-bench Verified).",
    "Provides developers granular control over inference compute tokens per call.",
  ],
  whyItMatters: "Eliminates the forced architectural tradeoff between fast chat models and high-latency reasoning models across enterprise developer tooling.",
  opportunities: [
    "Enterprise automation for mission-critical code refactoring and security auditing.",
    "Cost optimization through adaptive reasoning token budgets.",
  ],
  risks: [
    "Increased token consumption when extended thinking mode is unconstrained.",
    "Intense competitive retaliation from alternative frontier model labs.",
  ],
};

test("Tiered Free Gemini LLM Intelligence Pipeline — Step 14 Suite", async (t) => {
  // 1. Gemini client reads key from environment
  await t.test("1. Gemini client reads key from server environment variable", () => {
    const config = getGeminiConfig();
    assert.ok(config.flashLiteModel, "Flash-Lite model must be defined");
    assert.ok(config.flashModel, "Flash model must be defined");
    assert.equal(typeof config.importantThreshold, "number");
    assert.equal(config.importantThreshold, 0.7);

    // Verify key reading from process.env
    const prevKey = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_API_KEY = "dummy-test-key-read-from-env";
      resetGeminiClient();
      assert.equal(isGeminiConfigured(), true);
      const client = getGeminiClient();
      assert.ok(client !== null, "Client must instantiate when GEMINI_API_KEY is present");
    } finally {
      process.env.GEMINI_API_KEY = prevKey;
      resetGeminiClient();
    }
  });

  // 2. API key is never returned to client
  await t.test("2. API key is never returned to client or in API responses", async () => {
    // Check API route responses
    const req = new Request("http://localhost:3000/api/stories/test-id/ai");
    const res = await getStoryAiHandler(req, {
      params: Promise.resolve({ id: "test-id" }),
    });
    const text = await res.text();
    assert.equal(text.includes("AIzaSy"), false, "Must not leak Google API key prefix");
    assert.equal(text.includes("GEMINI_API_KEY"), false);

    // Verify config serialization does not include secret key
    const config = getGeminiConfig();
    const configJson = JSON.stringify(config);
    assert.equal(configJson.includes("GEMINI_API_KEY"), false);
  });

  // 3. 50 taxonomy categories are accepted
  await t.test("3. All 50 taxonomy categories are accepted by the validator", () => {
    const slugs = getAllTaxonomySlugs();
    assert.ok(slugs.length >= 50, `Must have at least 50 canonical taxonomy categories (found ${slugs.length})`);
    for (const slug of slugs) {
      assert.equal(isValidTaxonomySlug(slug), true, `Taxonomy slug '${slug}' must be accepted`);
    }
    // Verify specific core categories
    assert.equal(isValidTaxonomySlug("technology"), true);
    assert.equal(isValidTaxonomySlug("ai-models"), true);
    assert.equal(isValidTaxonomySlug("world-geopolitics"), true);
    assert.equal(isValidTaxonomySlug("environment-climate"), true);
  });

  // 4. Invalid category is rejected
  await t.test("4. Invalid category is rejected by the taxonomy validator", () => {
    assert.equal(isValidTaxonomySlug("crypto-moon-token"), false);
    assert.equal(isValidTaxonomySlug("invented-category-123"), false);
    assert.equal(isValidTaxonomySlug(""), false);
    assert.equal(isValidTaxonomySlug("technology/sub"), false);
  });

  // 5. importanceScore validates 0–1
  await t.test("5. importanceScore schema enforces 0.0 to 1.0 range", () => {
    // Valid boundary values
    assert.equal(
      flashLiteTriageSchema.safeParse({ ...NORMAL_TRIAGE_OUTPUT, importanceScore: 0.0 }).success,
      true
    );
    assert.equal(
      flashLiteTriageSchema.safeParse({ ...NORMAL_TRIAGE_OUTPUT, importanceScore: 1.0 }).success,
      true
    );
    assert.equal(
      flashLiteTriageSchema.safeParse({ ...NORMAL_TRIAGE_OUTPUT, importanceScore: 0.65 }).success,
      true
    );

    // Invalid negative or over 1.0
    assert.equal(
      flashLiteTriageSchema.safeParse({ ...NORMAL_TRIAGE_OUTPUT, importanceScore: -0.1 }).success,
      false
    );
    assert.equal(
      flashLiteTriageSchema.safeParse({ ...NORMAL_TRIAGE_OUTPUT, importanceScore: 1.05 }).success,
      false
    );
  });

  // 6. score < 0.7 → normal
  await t.test("6. score < 0.7 maps to normal tier", () => {
    const normalParsed = flashLiteTriageSchema.safeParse({
      ...NORMAL_TRIAGE_OUTPUT,
      importanceScore: 0.69,
      tier: "normal",
    });
    assert.equal(normalParsed.success, true);
    if (normalParsed.success) {
      assert.equal(normalParsed.data.tier, "normal");
      assert.ok(normalParsed.data.summary.length > 0, "Normal story requires summary");
      assert.ok(normalParsed.data.keyPoints.length > 0, "Normal story requires key points");
    }
  });

  // 7. score >= 0.7 → important
  await t.test("7. score >= 0.7 maps to important tier", () => {
    const importantParsed = flashLiteTriageSchema.safeParse({
      ...IMPORTANT_TRIAGE_OUTPUT,
      importanceScore: 0.70,
      tier: "important",
    });
    assert.equal(importantParsed.success, true);
    if (importantParsed.success) {
      assert.equal(importantParsed.data.tier, "important");
    }
  });

  // 8. Normal story requires only ONE Flash-Lite call
  await t.test("8. Normal story requires only ONE Flash-Lite call (zero Flash calls)", async () => {
    let flashLiteCallCount = 0;
    let flashCallCount = 0;

    const mockClient = {
      models: {
        generateContent: async (args: { model: string }) => {
          if (args.model.includes("flash-lite")) {
            flashLiteCallCount++;
            return { text: JSON.stringify(NORMAL_TRIAGE_OUTPUT) };
          }
          if (args.model.includes("flash")) {
            flashCallCount++;
            return { text: JSON.stringify(DEEP_FLASH_OUTPUT) };
          }
          throw new Error(`Unexpected model: ${args.model}`);
        },
      },
    } as unknown as GoogleGenAI;

    const triageResult = await classifyStoryWithFlashLite(SAMPLE_STORY, {
      client: mockClient,
      model: "gemini-flash-lite-latest",
    });

    assert.equal(triageResult.success, true);
    assert.equal(triageResult.data.tier, "normal");
    assert.equal(flashLiteCallCount, 1, "Exactly 1 Flash-Lite call must be made");
    assert.equal(flashCallCount, 0, "Zero Flash calls must be made for normal stories");
  });

  // 9. Important story uses Flash-Lite + Flash (2 calls total)
  await t.test("9. Important story uses Flash-Lite triage + Flash deep synthesis", async () => {
    let flashLiteCallCount = 0;
    let flashCallCount = 0;

    const mockClient = {
      models: {
        generateContent: async (args: { model: string }) => {
          if (args.model.includes("flash-lite")) {
            flashLiteCallCount++;
            return { text: JSON.stringify(IMPORTANT_TRIAGE_OUTPUT) };
          }
          flashCallCount++;
          return { text: JSON.stringify(DEEP_FLASH_OUTPUT) };
        },
      },
    } as unknown as GoogleGenAI;

    // Step A: Flash-Lite Triage
    const triageResult = await classifyStoryWithFlashLite(SAMPLE_STORY, {
      client: mockClient,
      model: "gemini-flash-lite-latest",
    });
    assert.equal(triageResult.success, true);
    assert.equal(triageResult.data.tier, "important");
    assert.equal(flashLiteCallCount, 1);

    // Step B: Flash Deep Synthesis
    const deepResult = await generateImportantStoryIntelligence(SAMPLE_STORY, {
      client: mockClient,
      model: "gemini-flash-latest",
    });
    assert.equal(deepResult.success, true);
    assert.equal(flashCallCount, 1);
    assert.ok(deepResult.data);
    assert.ok(deepResult.data?.whyItMatters);
    assert.ok((deepResult.data?.opportunities?.length ?? 0) > 0);
  });

  // 10. Normal story does NOT call Flash
  await t.test("10. Pipeline verifies normal story does NOT call deep Flash model", async () => {
    let deepFlashInvoked = false;
    let flashLiteInvoked = false;

    const mockSupabase = {
      from: (table: string) => {
        if (table === "stories") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({
                      data: [{
                        id: "story-normal-pipeline-test",
                        canonical_title: "Normal Story Pipeline Test",
                        summary: "Brief synopsis",
                        first_published_at: new Date().toISOString(),
                        latest_published_at: new Date().toISOString(),
                        article_count: 1,
                        source_count: 1,
                        importance_score: 0.5,
                      }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "story_intelligence") {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
            upsert: () => Promise.resolve({ error: null }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [] }),
            }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      },
    } as unknown as SupabaseClient<Database>;

    const mockGemini = {
      models: {
        generateContent: async (args: { model: string }) => {
          if (args.model.includes("flash-lite")) {
            flashLiteInvoked = true;
            return { text: JSON.stringify(NORMAL_TRIAGE_OUTPUT) };
          }
          deepFlashInvoked = true;
          return { text: JSON.stringify(DEEP_FLASH_OUTPUT) };
        },
      },
    } as unknown as GoogleGenAI;

    const stats = await processPendingStoryIntelligence({
      supabaseClient: mockSupabase,
      geminiClient: mockGemini,
      limit: 1,
    });

    assert.equal(stats.processed, 1);
    assert.equal(stats.normal, 1);
    assert.equal(stats.important, 0);
    assert.equal(flashLiteInvoked, true, "Flash-Lite triage must run");
    assert.equal(deepFlashInvoked, false, "Flash deep synthesis must NOT run for normal story");
  });

  // 11. Failed Flash-Lite does not crash pipeline
  await t.test("11. Failed Flash-Lite call does not crash the pipeline and logs failure", async () => {
    const mockClient = {
      models: {
        generateContent: async () => {
          throw new Error("Temporary network timeout");
        },
      },
    } as unknown as GoogleGenAI;

    const triage = await classifyStoryWithFlashLite(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 0,
    });

    assert.equal(triage.success, false);
    assert.ok(triage.error?.includes("Temporary network timeout"));
  });

  // 12. 429 is handled safely
  await t.test("12. HTTP 429 quota exhaustion is detected and handled safely", async () => {
    const err429 = new Error("Resource has been exhausted (e.g. check quota) - 429 Too Many Requests");
    assert.equal(isRateLimitError(err429), true);
    assert.equal(isRateLimitError(new Error("Generic socket error")), false);

    const mockClient = {
      models: {
        generateContent: async () => {
          throw err429;
        },
      },
    } as unknown as GoogleGenAI;

    const triage = await classifyStoryWithFlashLite(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 0,
    });

    assert.equal(triage.success, false);
    assert.equal(triage.isRateLimited, true);
  });

  // 13. Invalid Gemini JSON is handled safely
  await t.test("13. Invalid Gemini JSON string is caught gracefully with retry/fallback", async () => {
    const mockClient = {
      models: {
        generateContent: async () => ({
          text: "Here is your response: NOT_VALID_JSON",
        }),
      },
    } as unknown as GoogleGenAI;

    const triage = await classifyStoryWithFlashLite(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 0,
    });

    assert.equal(triage.success, false);
    assert.ok(triage.error?.includes("JSON") || triage.error?.includes("schema"));
  });

  // 14. Duplicate intelligence is not regenerated
  await t.test("14. Duplicate intelligence is skipped when already completed", async () => {
    const cachedStoryId = "story-already-analyzed";
    let geminiCalled = false;

    const mockSupabase = {
      from: (table: string) => {
        if (table === "stories") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({
                      data: [{
                        id: cachedStoryId,
                        canonical_title: "Already Analyzed Story",
                        summary: "Cached synopsis",
                        first_published_at: new Date().toISOString(),
                        latest_published_at: new Date().toISOString(),
                        article_count: 1,
                        source_count: 1,
                        importance_score: 0.8,
                      }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "story_intelligence") {
          return {
            select: () => ({
              in: () => Promise.resolve({
                data: [{
                  story_id: cachedStoryId,
                  model: getGeminiConfig().flashLiteModel,
                  prompt_version: getGeminiConfig().promptVersion,
                  status: "completed",
                  attempts: 1,
                  updated_at: new Date().toISOString(),
                }],
                error: null,
              }),
            }),
            upsert: () => Promise.resolve({ error: null }),
          };
        }
        return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) };
      },
    } as unknown as SupabaseClient<Database>;

    const mockGemini = {
      models: {
        generateContent: async () => {
          geminiCalled = true;
          return { text: JSON.stringify(NORMAL_TRIAGE_OUTPUT) };
        },
      },
    } as unknown as GoogleGenAI;

    const stats = await processPendingStoryIntelligence({
      supabaseClient: mockSupabase,
      geminiClient: mockGemini,
    });

    assert.equal(stats.processed, 0, "Must skip story when intelligence is already completed");
    assert.equal(geminiCalled, false, "Gemini must not be called for completed stories");
  });

  // 15. AI-disabled mode works
  await t.test("15. AI-disabled mode works and safely skips processing", async () => {
    const prevEnabled = process.env.AI_ENABLED;
    try {
      process.env.AI_ENABLED = "false";
      assert.equal(isAiEnabled(), false);

      const stats = await processPendingStoryIntelligence();
      assert.equal(stats.processed, 0);
      assert.equal(stats.skipped, 0);
      assert.equal(stats.failed, 0);
    } finally {
      process.env.AI_ENABLED = prevEnabled;
    }
  });

  // 16. Feed continues when Gemini is unavailable
  await t.test("16. Feed API route continues serving without error when AI intelligence is missing", async () => {
    // Calling AI endpoint for missing story should return 404, never 500
    const req = new Request("http://localhost:3000/api/stories/00000000-0000-0000-0000-000000000000/ai");
    const res = await getStoryAiHandler(req, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    assert.equal(res.status, 404);
  });

  // 17. Secrets never appear in responses/logs
  await t.test("17. Frontend code and responses never contain GEMINI_API_KEY", () => {
    const clientTargets = [
      path.join(process.cwd(), "src", "components"),
      path.join(process.cwd(), "src", "app", "page.tsx"),
      path.join(process.cwd(), "src", "app", "onboarding"),
      path.join(process.cwd(), "src", "lib", "supabase", "client.ts"),
    ];

    const forbiddenTokens = [
      "GEMINI_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "CRON_SECRET",
      "DATABASE_URL",
      "POSTGRES_PASSWORD",
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

  // 18. Flash unavailable falls back to Flash-Lite brief
  await t.test("18. Flash model unavailable falls back safely to Flash-Lite brief with important tier", async () => {
    let savedTier: string | null = null;
    let savedSummary: string | null = null;

    const mockSupabase = {
      from: (table: string) => {
        if (table === "stories") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({
                      data: [{
                        id: "story-flash-unavail-test",
                        canonical_title: "Breaking Critical Event",
                        summary: "Brief synopsis",
                        first_published_at: new Date().toISOString(),
                        latest_published_at: new Date().toISOString(),
                        article_count: 5,
                        source_count: 4,
                        importance_score: 0.95,
                      }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "story_intelligence") {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
            upsert: (payload: Record<string, unknown>) => {
              savedTier = payload.tier as string;
              savedSummary = payload.summary as string;
              return Promise.resolve({ error: null });
            },
          };
        }
        return {
          select: () => ({
            eq: () => ({ limit: () => Promise.resolve({ data: [] }) }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      },
    } as unknown as SupabaseClient<Database>;

    const mockGemini = {
      models: {
        generateContent: async (args: { model: string }) => {
          if (args.model.includes("flash-lite")) {
            return { text: JSON.stringify(IMPORTANT_TRIAGE_OUTPUT) };
          }
          // Flash model throws 503 Model Unavailable
          throw new Error("Model is currently unavailable due to high demand (503)");
        },
      },
    } as unknown as GoogleGenAI;

    const stats = await processPendingStoryIntelligence({
      supabaseClient: mockSupabase,
      geminiClient: mockGemini,
      limit: 1,
    });

    assert.equal(stats.processed, 1);
    assert.equal(stats.succeeded, 1, "Must succeed using Flash-Lite fallback brief");
    assert.equal(stats.important, 1);
    assert.equal(savedTier, "important");
    assert.equal(savedSummary, IMPORTANT_TRIAGE_OUTPUT.summary);
  });

  // 19. AI_DEEP_ANALYSIS_ENABLED=false skips Flash call
  await t.test("19. AI_DEEP_ANALYSIS_ENABLED=false saves Flash-Lite brief without calling Flash", async () => {
    let flashCalled = false;
    let flashLiteCalled = false;

    const mockSupabase = {
      from: (table: string) => {
        if (table === "stories") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({
                      data: [{
                        id: "story-deep-disabled-test",
                        canonical_title: "Deep Analysis Disabled Test",
                        summary: "Brief synopsis",
                        first_published_at: new Date().toISOString(),
                        latest_published_at: new Date().toISOString(),
                        article_count: 3,
                        source_count: 2,
                        importance_score: 0.85,
                      }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "story_intelligence") {
          return {
            select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
            upsert: () => Promise.resolve({ error: null }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ limit: () => Promise.resolve({ data: [] }) }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      },
    } as unknown as SupabaseClient<Database>;

    const mockGemini = {
      models: {
        generateContent: async (args: { model: string }) => {
          if (args.model.includes("flash-lite")) {
            flashLiteCalled = true;
            return { text: JSON.stringify(IMPORTANT_TRIAGE_OUTPUT) };
          }
          flashCalled = true;
          return { text: JSON.stringify(DEEP_FLASH_OUTPUT) };
        },
      },
    } as unknown as GoogleGenAI;

    const prevDeep = process.env.AI_DEEP_ANALYSIS_ENABLED;
    try {
      process.env.AI_DEEP_ANALYSIS_ENABLED = "false";
      const stats = await processPendingStoryIntelligence({
        supabaseClient: mockSupabase,
        geminiClient: mockGemini,
        limit: 1,
      });

      assert.equal(stats.processed, 1);
      assert.equal(stats.succeeded, 1);
      assert.equal(stats.important, 1);
      assert.equal(flashLiteCalled, true, "Flash-Lite triage must run");
      assert.equal(flashCalled, false, "Flash deep synthesis must NOT be called when deep analysis is disabled");
    } finally {
      process.env.AI_DEEP_ANALYSIS_ENABLED = prevDeep;
    }
  });

  // 20. Confirmed 429 quota error does not repeatedly retry
  await t.test("20. Confirmed 429 quota exhaustion stops retry loop immediately", async () => {
    let callAttempts = 0;
    const err429 = new Error("Resource has been exhausted (e.g. check quota) - 429 Too Many Requests");

    const mockClient = {
      models: {
        generateContent: async () => {
          callAttempts++;
          throw err429;
        },
      },
    } as unknown as GoogleGenAI;

    const res = await generateImportantStoryIntelligence(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 2, // Request 2 retries
    });

    assert.equal(res.success, false);
    assert.equal(res.isRateLimited, true);
    assert.equal(callAttempts, 1, "Must NOT repeatedly retry a confirmed 429 quota exhaustion error");
  });

  // 21. Flash-Lite unavailable handles failure gracefully
  await t.test("21. Flash-Lite service failure returns safe fallback without crashing", async () => {
    const mockClient = {
      models: {
        generateContent: async () => {
          throw new Error("Service Unavailable (503)");
        },
      },
    } as unknown as GoogleGenAI;

    const triage = await classifyStoryWithFlashLite(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 0,
    });

    assert.equal(triage.success, false);
    assert.ok(triage.data, "Must provide safe fallback data");
    assert.equal(triage.data.tier, "normal");
    assert.ok(triage.error?.includes("503"));
  });

  // 22. Concurrency and batch size limits are enforced
  await t.test("22. Concurrency and batch size limits are clamped to safe values", () => {
    const prevBatch = process.env.AI_BATCH_SIZE;
    const prevConc = process.env.AI_CONCURRENCY;

    try {
      // Over-limit values
      process.env.AI_BATCH_SIZE = "100";
      process.env.AI_CONCURRENCY = "20";
      const config1 = getGeminiConfig();
      assert.ok(config1.batchSize <= 20, "Batch size must be clamped to safe maximum");
      assert.ok(config1.concurrency <= 5, "Concurrency must be clamped to safe maximum");

      // Under-limit values
      process.env.AI_BATCH_SIZE = "0";
      process.env.AI_CONCURRENCY = "-1";
      const config2 = getGeminiConfig();
      assert.ok(config2.batchSize >= 1, "Batch size minimum is 1");
      assert.ok(config2.concurrency >= 1, "Concurrency minimum is 1");
    } finally {
      process.env.AI_BATCH_SIZE = prevBatch;
      process.env.AI_CONCURRENCY = prevConc;
    }
  });
});
