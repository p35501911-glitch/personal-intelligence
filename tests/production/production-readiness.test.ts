import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  checkRateLimit,
  getClientIdentifier,
  resetRateLimits,
  RATE_LIMIT_CONFIGS,
} from "@/server/security/rate-limiter";
import { validateRedirectTarget } from "@/app/auth/callback/route";
import { getWorkerStatus, resetWorkerLock, runIngestionCycle } from "@/server/news/worker";
import { generateTopicDigest, computePeriodWindow } from "@/server/news/digests";
import { saveStoryBodySchema } from "@/app/api/saved-stories/route";
import { feedQuerySchema } from "@/app/api/feed/route";
import {
  isAiEnabled,
  isGeminiConfigured,
  getFlashLiteModel,
  getFlashModel,
} from "@/server/ai/client";

// Load test environment
const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

test("Phase 4: Production Readiness Comprehensive Suite", async (t) => {
  t.beforeEach(() => {
    resetRateLimits();
    resetWorkerLock();
  });

  // -------------------------------------------------------------------
  // 1. Authentication & OAuth Callback
  // -------------------------------------------------------------------
  await t.test("1. Google OAuth callback validates redirect targets and prevents open redirects", () => {
    // Valid relative paths
    assert.strictEqual(validateRedirectTarget("/"), "/");
    assert.strictEqual(validateRedirectTarget("/onboarding/categories"), "/onboarding/categories");
    assert.strictEqual(validateRedirectTarget("/?tab=digests"), "/?tab=digests");

    // Malicious open redirect attempts must be neutralized to "/"
    assert.strictEqual(validateRedirectTarget("https://malicious-site.com"), "/");
    assert.strictEqual(validateRedirectTarget("http://evil.com/phish"), "/");
    assert.strictEqual(validateRedirectTarget("//evil.com"), "/");
    assert.strictEqual(validateRedirectTarget("/\\evil.com"), "/");
    assert.strictEqual(validateRedirectTarget(null), "/");
    assert.strictEqual(validateRedirectTarget(""), "/");
  });

  // -------------------------------------------------------------------
  // 2. Authorization & Client Spoofing Protection
  // -------------------------------------------------------------------
  await t.test("2. Client-supplied userId query parameter is stripped and rejected in feed schema", () => {
    const rawInput = {
      userId: "attacker-fake-uuid",
      limit: "15",
      offset: "0",
    };

    const parsed = feedQuerySchema.safeParse(rawInput);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(
        (parsed.data as Record<string, unknown>).userId,
        undefined,
        "userId must never be accepted from client query"
      );
      assert.strictEqual(parsed.data.limit, 15);
    }
  });

  await t.test("3. Saved stories mutation strictly rejects arbitrary userId injection in body", () => {
    const maliciousBody = {
      userId: "victim-uuid-1234",
      storyId: "target-story-5678",
    };

    const parsed = saveStoryBodySchema.safeParse(maliciousBody);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(
        (parsed.data as Record<string, unknown>).userId,
        undefined,
        "userId injected in body must be ignored by save schema"
      );
      assert.strictEqual(parsed.data.storyId, "target-story-5678");
    }
  });

  // -------------------------------------------------------------------
  // 3. API Rate Limiting
  // -------------------------------------------------------------------
  await t.test("4. API Rate Limiter throttles repeated requests exceeding threshold with standard 429 semantics", () => {
    const testKey = "user:test-user-123";
    const rule = { limit: 3, windowMs: 1000 };

    // Request 1: Allowed
    const res1 = checkRateLimit(testKey, rule);
    assert.strictEqual(res1.allowed, true);
    assert.strictEqual(res1.remaining, 2);

    // Request 2: Allowed
    const res2 = checkRateLimit(testKey, rule);
    assert.strictEqual(res2.allowed, true);
    assert.strictEqual(res2.remaining, 1);

    // Request 3: Allowed
    const res3 = checkRateLimit(testKey, rule);
    assert.strictEqual(res3.allowed, true);
    assert.strictEqual(res3.remaining, 0);

    // Request 4: Throttled
    const res4 = checkRateLimit(testKey, rule);
    assert.strictEqual(res4.allowed, false);
    assert.strictEqual(res4.remaining, 0);
    assert.ok(res4.retryAfterSeconds >= 1);
  });

  await t.test("5. Rate limiter derives client identifier prioritizing userId over IP headers", () => {
    const mockReq = new Request("http://localhost:3000/api/feed", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18",
        "x-real-ip": "203.0.113.195",
      },
    });

    // When userId provided -> user identifier
    assert.strictEqual(getClientIdentifier(mockReq, "user-abc-999"), "user:user-abc-999");

    // When no userId -> client IP identifier
    assert.strictEqual(getClientIdentifier(mockReq, null), "ip:203.0.113.195");
  });

  // -------------------------------------------------------------------
  // 4. Ingestion Concurrency & Mutual Exclusion
  // -------------------------------------------------------------------
  await t.test("6. Ingestion worker mutex lock prevents overlapping concurrent runs", async () => {
    resetWorkerLock();

    // Start a simulated long-running ingestion cycle
    const workerPromise1 = runIngestionCycle({
      providers: [],
    });

    // Immediate second invocation should be rejected with 'already_running'
    const workerPromise2 = runIngestionCycle({
      providers: [],
    });

    const [report1, report2] = await Promise.all([workerPromise1, workerPromise2]);

    assert.ok(
      report1.status === "completed" || report2.status === "completed",
      "One run must complete"
    );
    assert.ok(
      report1.status === "already_running" || report2.status === "already_running",
      "Concurrent overlapping run must be rejected"
    );
  });

  // -------------------------------------------------------------------
  // 5. Digest Period Idempotency & Batch Scheduling
  // -------------------------------------------------------------------
  await t.test("7. Period window calculation is deterministic and canonical", async () => {
    const fixedTime = new Date("2026-09-14T12:00:00.000Z");

    const dailyWindow = computePeriodWindow("daily", fixedTime);
    assert.strictEqual(dailyWindow.periodEnd, "2026-09-14T12:00:00.000Z");
    assert.strictEqual(dailyWindow.periodStart, "2026-09-13T12:00:00.000Z");

    const weeklyWindow = computePeriodWindow("weekly", fixedTime);
    assert.strictEqual(weeklyWindow.periodEnd, "2026-09-14T12:00:00.000Z");
    assert.strictEqual(weeklyWindow.periodStart, "2026-09-07T12:00:00.000Z");

    // generateTopicDigest throws if userId is missing
    await assert.rejects(
      async () => {
        await generateTopicDigest({
          userId: "",
          periodType: "daily",
        });
      },
      /userId is required/
    );

    // Verify rate limit configs are configured
    assert.ok(RATE_LIMIT_CONFIGS.aiProcessing.limit > 0);
    assert.ok(RATE_LIMIT_CONFIGS.digestGeneration.limit > 0);
    assert.ok(RATE_LIMIT_CONFIGS.feedRead.limit > 0);

    // getWorkerStatus returns safe state
    const status = getWorkerStatus();
    assert.ok(status.status === "idle" || status.status === "running");
  });

  // -------------------------------------------------------------------
  // 6. Secret Isolation Audit
  // -------------------------------------------------------------------
  await t.test("8. Secrets (GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY) are never bundled into client modules", () => {
    const clientFiles = [
      "src/components/feed/feed-container.tsx",
      "src/components/feed/feed-card.tsx",
      "src/components/digests/digest-view.tsx",
      "src/components/saved-stories/saved-intelligence-view.tsx",
      "src/components/auth/user-menu.tsx",
      "src/app/login/page.tsx",
    ];

    for (const relPath of clientFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        assert.ok(
          !content.includes("process.env.GEMINI_API_KEY"),
          `${relPath} must never reference GEMINI_API_KEY`
        );
        assert.ok(
          !content.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"),
          `${relPath} must never reference SUPABASE_SERVICE_ROLE_KEY`
        );
      }
    }
  });

  // -------------------------------------------------------------------
  // 7. System Health Telemetry Hygiene
  // -------------------------------------------------------------------
  await t.test("9. AI client exposes model telemetry without exposing private credentials", () => {
    const flashLite = getFlashLiteModel();
    const flash = getFlashModel();

    assert.ok(flashLite.includes("flash-lite"));
    assert.ok(flash.includes("flash"));

    // Telemetry functions return safe booleans
    assert.strictEqual(typeof isAiEnabled(), "boolean");
    assert.strictEqual(typeof isGeminiConfigured(), "boolean");
  });
});
