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
  getGeminiClient,
  resetGeminiClient,
} from "@/server/ai/client";
import {
  storyIntelligenceSchema,
  type StoryInputForAI,
} from "@/server/ai/types";
import {
  generateStoryIntelligence,
  isRateLimitError,
} from "@/server/ai/service";
import {
  CURRENT_AI_PROMPT_VERSION,
  buildStoryPrompt,
} from "@/server/ai/prompts";
import { processPendingStoryIntelligence } from "@/server/ai/pipeline";
import { GET as getStoryAiHandler } from "@/app/api/stories/[id]/ai/route";

// Sample valid story input
const SAMPLE_STORY: StoryInputForAI = {
  id: "story-ai-test-1",
  canonicalTitle: "OpenAI Launches Frontier Multimodal Reasoning Model",
  summary: "OpenAI announced a new reasoning model for coding and STEM tasks.",
  firstPublishedAt: new Date(Date.now() - 3600000).toISOString(),
  latestPublishedAt: new Date().toISOString(),
  articleCount: 3,
  sourceCount: 2,
  sources: [{ name: "TechCrunch" }, { name: "Reuters" }],
  categories: [{ categoryName: "AI Models", isPrimary: true }],
  articlesPreview: [
    {
      title: "OpenAI announces reasoning model",
      publisher: "TechCrunch",
      description: "The model improves autonomous problem solving.",
    },
  ],
};

// Sample valid AI structured output
const VALID_AI_OUTPUT = {
  summary: "OpenAI has officially launched a next-generation multimodal model designed specifically to solve complex reasoning, coding, and mathematical problems with higher precision.",
  keyPoints: [
    "New architecture enhances chain-of-thought verification.",
    "Benchmark tests show double-digit gains in advanced STEM problem solving.",
    "Immediate developer availability through tiered API access.",
  ],
  whyItMatters: "Accelerates the transition from passive conversational models to autonomous technical problem-solving systems across enterprise engineering.",
  opportunities: [
    "Automated software engineering and vulnerability remediation.",
    "Lower development cycles for complex scientific algorithms.",
  ],
  risks: [
    "Potential economic disruption for routine coding workflows.",
    "Increased inference compute and energy requirements.",
  ],
};

test("Phase 3C — Free Gemini AI Intelligence Suite", async (t) => {
  // Test 1: Gemini configuration loading
  await t.test("1. Gemini configuration loads defaults and env overrides", () => {
    const config = getGeminiConfig();
    assert.ok(config.model, "Model must be defined");
    assert.equal(typeof config.promptVersion, "number");
    assert.ok(config.batchSize >= 1 && config.batchSize <= 20);
    assert.ok(config.timeoutMs >= 3000);
    assert.ok(config.maxRetries >= 0);
  });

  // Test 2: Missing GEMINI_API_KEY handling
  await t.test("2. Missing GEMINI_API_KEY handled gracefully without crashing", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    resetGeminiClient();

    try {
      assert.equal(isGeminiConfigured(), false);
      assert.equal(getGeminiClient(), null);

      const result = await generateStoryIntelligence(SAMPLE_STORY);
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("GEMINI_API_KEY"));
    } finally {
      process.env.GEMINI_API_KEY = prevKey;
      resetGeminiClient();
    }
  });

  // Test 3: Gemini client initialization
  await t.test("3. Gemini client initialization and singleton caching", () => {
    resetGeminiClient();
    const mockKey = "test-mock-gemini-key-12345";
    const client1 = getGeminiClient(mockKey);
    const client2 = getGeminiClient(mockKey);
    assert.ok(client1 !== null);
    assert.equal(client1, client2, "Should return cached singleton instance for same key");
    resetGeminiClient();
  });

  // Test 4: Structured response validation with Zod
  await t.test("4. Structured response validation enforces schema rules", () => {
    const validParsed = storyIntelligenceSchema.safeParse(VALID_AI_OUTPUT);
    assert.equal(validParsed.success, true);

    // Missing required field: summary
    const invalidNoSummary = { ...VALID_AI_OUTPUT, summary: "" };
    assert.equal(storyIntelligenceSchema.safeParse(invalidNoSummary).success, false);

    // Less than 2 key points
    const invalidPoints = { ...VALID_AI_OUTPUT, keyPoints: ["One point only"] };
    assert.equal(storyIntelligenceSchema.safeParse(invalidPoints).success, false);

    // Missing whyItMatters
    const invalidWhy = { ...VALID_AI_OUTPUT, whyItMatters: "Too short" };
    assert.equal(storyIntelligenceSchema.safeParse(invalidWhy).success, false);
  });

  // Test 5: Successful AI generation with mock Gemini client
  await t.test("5. Successful AI generation with mocked Gemini SDK", async () => {
    const mockClient = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify(VALID_AI_OUTPUT),
        }),
      },
    } as unknown as GoogleGenAI;

    const res = await generateStoryIntelligence(SAMPLE_STORY, { client: mockClient });
    assert.equal(res.success, true);
    assert.ok(res.data);
    assert.equal(res.data.summary, VALID_AI_OUTPUT.summary);
    assert.equal(res.data.keyPoints.length, 3);
    assert.equal(res.data.opportunities.length, 2);
  });

  // Test 6: Invalid Gemini response handled safely
  await t.test("6. Malformed Gemini response falls back safely without throwing", async () => {
    const mockClient = {
      models: {
        generateContent: async () => ({
          text: "I am unable to analyze this story because I am a conversational AI.",
        }),
      },
    } as unknown as GoogleGenAI;

    const res = await generateStoryIntelligence(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 0,
    });
    assert.equal(res.success, false);
    assert.ok(res.error);
    assert.ok(res.error.includes("Failed to parse Gemini JSON output") || res.error.includes("Invalid intelligence schema"));
  });

  // Test 7: Gemini request timeout
  await t.test("7. Gemini request timeout triggers graceful failure", async () => {
    const mockClient = {
      models: {
        generateContent: async () => {
          // Delay longer than timeout
          await new Promise((resolve) => setTimeout(resolve, 80));
          return { text: JSON.stringify(VALID_AI_OUTPUT) };
        },
      },
    } as unknown as GoogleGenAI;

    const res = await generateStoryIntelligence(SAMPLE_STORY, {
      client: mockClient,
      timeoutMs: 20,
      maxRetries: 0,
    });
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("timed out"));
  });

  // Test 8: Gemini 429 rate limit detection
  await t.test("8. Gemini 429 rate limit detection and flag", async () => {
    const err429 = new Error("Resource has been exhausted (e.g. check quota) - 429 Too Many Requests");
    assert.equal(isRateLimitError(err429), true);
    assert.equal(isRateLimitError(new Error("Generic network socket error")), false);

    const mockClient = {
      models: {
        generateContent: async () => {
          throw err429;
        },
      },
    } as unknown as GoogleGenAI;

    const res = await generateStoryIntelligence(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 0,
    });
    assert.equal(res.success, false);
    assert.equal(res.isRateLimited, true);
  });

  // Test 9: Retry with backoff behavior
  await t.test("9. Retries on temporary failure before returning success", async () => {
    let callCount = 0;
    const mockClient = {
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error("Temporary network glitch");
          }
          return { text: JSON.stringify(VALID_AI_OUTPUT) };
        },
      },
    } as unknown as GoogleGenAI;

    const res = await generateStoryIntelligence(SAMPLE_STORY, {
      client: mockClient,
      maxRetries: 1,
    });
    assert.equal(res.success, true);
    assert.equal(callCount, 2);
    assert.ok(res.data);
  });

  // Test 10: Duplicate generation prevention (caching)
  await t.test("10. Caching skips stories already analyzed with current version", async () => {
    const existingStoryId = "story-cached-1";
    let upsertCalled = false;

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
                        id: existingStoryId,
                        canonical_title: "Cached Story",
                        summary: "Summary",
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
                  story_id: existingStoryId,
                  model: getGeminiConfig().model,
                  prompt_version: CURRENT_AI_PROMPT_VERSION,
                  status: "completed",
                  attempts: 1,
                  updated_at: new Date().toISOString(),
                }],
                error: null,
              }),
            }),
            upsert: () => {
              upsertCalled = true;
              return Promise.resolve({ error: null });
            },
          };
        }
        return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) };
      },
    } as unknown as SupabaseClient<Database>;

    const mockGemini = {
      models: {
        generateContent: async () => ({ text: JSON.stringify(VALID_AI_OUTPUT) }),
      },
    } as unknown as GoogleGenAI;

    const stats = await processPendingStoryIntelligence({
      supabaseClient: mockSupabase,
      geminiClient: mockGemini,
    });

    assert.equal(stats.processed, 0, "Cached story should be skipped");
    assert.equal(upsertCalled, false, "Gemini should not be called for cached story");
  });

  // Test 11: Model / Prompt version invalidation
  await t.test("11. Outdated prompt version triggers re-analysis", async () => {
    const outdatedStoryId = "story-outdated-prompt";
    let reanalyzed = false;

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
                        id: outdatedStoryId,
                        canonical_title: "Outdated Prompt Story",
                        summary: "Summary",
                        first_published_at: new Date().toISOString(),
                        latest_published_at: new Date().toISOString(),
                        article_count: 1,
                        source_count: 1,
                        importance_score: 0.7,
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
                  story_id: outdatedStoryId,
                  model: getGeminiConfig().model,
                  prompt_version: 0, // Outdated version!
                  status: "completed",
                  attempts: 1,
                  updated_at: new Date().toISOString(),
                }],
                error: null,
              }),
            }),
            upsert: () => {
              reanalyzed = true;
              return Promise.resolve({ error: null });
            },
          };
        }
        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient<Database>;

    const mockGemini = {
      models: {
        generateContent: async () => ({ text: JSON.stringify(VALID_AI_OUTPUT) }),
      },
    } as unknown as GoogleGenAI;

    const stats = await processPendingStoryIntelligence({
      supabaseClient: mockSupabase,
      geminiClient: mockGemini,
      limit: 1,
    });

    assert.equal(stats.processed, 1, "Story with outdated prompt must be re-analyzed");
    assert.equal(reanalyzed, true);
  });

  // Test 12: AI processing failure does not break ingestion
  await t.test("12. AI pipeline failure does not throw or crash caller", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              order: () => ({
                limit: () => Promise.reject(new Error("Database connection dropped")),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const stats = await processPendingStoryIntelligence({
      supabaseClient: mockSupabase,
      geminiClient: null,
    });
    assert.ok(stats);
    assert.ok(stats.errors.length > 0);
  });

  // Test 13: AI data persistence
  await t.test("13. AI generation data persists into story_intelligence", async () => {
    const targetStoryId = "story-to-persist-ai";
    let persistedRecord: Record<string, unknown> | null = null;

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
                        id: targetStoryId,
                        canonical_title: "Persistence Test Story",
                        summary: "Summary",
                        first_published_at: new Date().toISOString(),
                        latest_published_at: new Date().toISOString(),
                        article_count: 1,
                        source_count: 1,
                        importance_score: 0.9,
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
              persistedRecord = payload;
              return Promise.resolve({ error: null });
            },
          };
        }
        return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) };
      },
    } as unknown as SupabaseClient<Database>;

    const mockGemini = {
      models: {
        generateContent: async () => ({ text: JSON.stringify(VALID_AI_OUTPUT) }),
      },
    } as unknown as GoogleGenAI;

    const stats = await processPendingStoryIntelligence({
      supabaseClient: mockSupabase,
      geminiClient: mockGemini,
      limit: 1,
    });

    assert.equal(stats.succeeded, 1);
    assert.ok(persistedRecord !== null);
    const saved = persistedRecord as Record<string, unknown>;
    assert.equal(saved.story_id, targetStoryId);
    assert.equal(saved.summary, VALID_AI_OUTPUT.summary);
    assert.equal(saved.why_it_matters, VALID_AI_OUTPUT.whyItMatters);
    assert.equal(saved.status, "completed");
  });

  // Test 14: AI retrieval API (GET /api/stories/[id]/ai)
  await t.test("14. AI retrieval route returns 400, 404, or intelligence payload", async () => {
    // 14a: Missing ID
    const emptyIdReq = new Request("http://localhost:3000/api/stories//ai");
    const resEmpty = await getStoryAiHandler(emptyIdReq, {
      params: Promise.resolve({ id: "" }),
    });
    assert.equal(resEmpty.status, 400);

    // 14b: Non-existent story returns 404
    const notFoundReq = new Request("http://localhost:3000/api/stories/00000000-0000-0000-0000-000000000000/ai");
    const resNotFound = await getStoryAiHandler(notFoundReq, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    assert.equal(resNotFound.status, 404);
  });

  // Test 15: Prompt builder token minimization
  await t.test("15. Prompt builder minimizes token count and ignores HTML tags", () => {
    const prompt = buildStoryPrompt({
      id: "s-1",
      canonicalTitle: "Test Headline",
      articlesPreview: [
        {
          title: "Article 1",
          publisher: "BBC",
          content: "<p>This is <b>HTML</b> content that must be stripped cleanly.</p>",
        },
      ],
    });
    assert.ok(prompt.includes("Test Headline"));
    assert.ok(!prompt.includes("<p>"), "HTML tags must be stripped");
    assert.ok(!prompt.includes("<b>"));
  });

  // Test 16: API key is never leaked in intelligence output or prompts
  await t.test("16. API key is never contained in prompt or returned intelligence", () => {
    const prompt = buildStoryPrompt(SAMPLE_STORY);
    assert.equal(prompt.includes("AIzaSy"), false);
    assert.equal(prompt.includes("GEMINI_API_KEY"), false);

    const jsonStr = JSON.stringify(VALID_AI_OUTPUT);
    assert.equal(jsonStr.includes("AIzaSy"), false);
    assert.equal(jsonStr.includes("GEMINI_API_KEY"), false);
  });

  // Test 17: Client bundle secret leak detection
  await t.test("17. Frontend code never contains GEMINI_API_KEY", () => {
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
});
