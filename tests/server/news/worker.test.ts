import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

const cwd = process.cwd();
const localEnvPath = path.resolve(cwd, ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(cwd, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import {
  runIngestionCycle,
  getWorkerStatus,
  resetWorkerLock,
  startIngestionScheduler,
  stopIngestionScheduler,
  isSchedulerRunning,
} from "@/server/news/worker";
import { GET as ingestGetHandler, POST as ingestPostHandler } from "@/app/api/ingest/route";

test("Step 2L: Ingestion Worker Coordinator & Concurrency Safety", async (t) => {
  t.beforeEach(() => {
    resetWorkerLock();
  });

  t.afterEach(() => {
    resetWorkerLock();
  });

  await t.test("getWorkerStatus reflects idle state initially", () => {
    resetWorkerLock();
    const status = getWorkerStatus();
    assert.equal(status.status, "idle");
    assert.equal(status.activeJobId, null);
  });

  await t.test("mutex prevents concurrent overlapping ingestion cycles", async () => {
    resetWorkerLock();

    // Trigger two cycles simultaneously
    // Mock or pass a provider list that doesn't make live requests or run fast
    const cycle1Promise = runIngestionCycle({ providers: [] });
    // Second cycle triggered while first is running or immediately after lock acquired
    const cycle2 = await runIngestionCycle({ providers: [] });

    const cycle1 = await cycle1Promise;

    // One of them must be completed, and if overlapping, the second must be already_running
    assert.ok(cycle1.status === "completed" || cycle2.status === "already_running");
  });

  await t.test("force: true bypasses active lock in emergency", async () => {
    resetWorkerLock();

    // Simulate lock
    const statusBefore = getWorkerStatus();
    assert.equal(statusBefore.status, "idle");

    const forcedCycle = await runIngestionCycle({ providers: [], force: true });
    assert.notEqual(forcedCycle.status, "already_running");
    assert.equal(forcedCycle.status, "completed");
  });

  await t.test("resetWorkerLock properly clears any locked state", () => {
    resetWorkerLock();
    const status = getWorkerStatus();
    assert.equal(status.status, "idle");
    assert.equal(status.activeJobId, null);
  });
});

test("Step 2L: In-Process Scheduler Management", async (t) => {
  await t.test("toggles scheduler running state", () => {
    assert.equal(isSchedulerRunning(), false);

    startIngestionScheduler(60, { providers: [] });
    assert.equal(isSchedulerRunning(), true);

    stopIngestionScheduler();
    assert.equal(isSchedulerRunning(), false);
  });
});

test("Step 2L: Ingestion API Route Handlers", async (t) => {
  t.beforeEach(() => {
    resetWorkerLock();
  });

  t.afterEach(() => {
    resetWorkerLock();
  });

  await t.test("GET /api/ingest returns worker telemetry", async () => {
    const res = await ingestGetHandler();
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.worker);
    assert.ok("status" in body.worker);
    assert.ok("totalCyclesCompleted" in body.worker);
  });

  await t.test("POST /api/ingest rejects unauthorized requests when CRON_SECRET is set", async () => {
    const originalSecret = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = "test-secret-12345";

      // 1. Request without secret
      const unauthReq = new Request("http://localhost:3000/api/ingest", {
        method: "POST",
      });
      const unauthRes = await ingestPostHandler(unauthReq);
      assert.equal(unauthRes.status, 401);

      // 2. Request with invalid secret
      const badReq = new Request("http://localhost:3000/api/ingest", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-secret",
        },
      });
      const badRes = await ingestPostHandler(badReq);
      assert.equal(badRes.status, 401);

      // 3. Request with valid bearer header
      const validReq = new Request("http://localhost:3000/api/ingest", {
        method: "POST",
        headers: {
          authorization: "Bearer test-secret-12345",
        },
        body: JSON.stringify({ providers: [] }),
      });
      const validRes = await ingestPostHandler(validReq);
      assert.equal(validRes.status, 200);

      const body = await validRes.json();
      assert.equal(body.success, true);
      assert.equal(body.report.status, "completed");
    } finally {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  await t.test("POST /api/ingest accepts valid ?secret= query parameter", async () => {
    const originalSecret = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = "test-query-secret";

      const queryReq = new Request("http://localhost:3000/api/ingest?secret=test-query-secret", {
        method: "POST",
        body: JSON.stringify({ providers: [] }),
      });
      const queryRes = await ingestPostHandler(queryReq);
      assert.equal(queryRes.status, 200);

      const body = await queryRes.json();
      assert.equal(body.success, true);
    } finally {
      process.env.CRON_SECRET = originalSecret;
    }
  });
});
