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
  classifyPublisher,
  computeAggregatePublisherAuthority,
  evaluateEventProminence,
  computeCoverageBreadth,
  computeReportingVelocity,
  computeStoryImportance,
} from "@/server/news/importance";
import { GET as storiesRouteHandler, storiesQuerySchema } from "@/app/api/stories/route";

test("Step 2K: Publisher Authority Tiers", async (t) => {
  await t.test("classifies Tier 1 global news wires and premier institutions", () => {
    const reuters = classifyPublisher({ name: "Reuters News Agency", url: "https://reuters.com/world" });
    assert.equal(reuters.tier, 1);
    assert.equal(reuters.weight, 1.0);

    const bbc = classifyPublisher({ name: "BBC News", url: "https://bbc.co.uk/news" });
    assert.equal(bbc.tier, 1);

    const wsj = classifyPublisher({ name: "The Wall Street Journal", domain: "wsj.com" });
    assert.equal(wsj.tier, 1);

    const bloomberg = classifyPublisher({ name: "Bloomberg Markets", url: "https://bloomberg.com/news" });
    assert.equal(bloomberg.tier, 1);
  });

  await t.test("classifies Tier 2 domain authorities and business/tech press", () => {
    const tc = classifyPublisher({ name: "TechCrunch", url: "https://techcrunch.com" });
    assert.equal(tc.tier, 2);
    assert.equal(tc.weight, 0.75);

    const verge = classifyPublisher({ name: "The Verge", url: "https://theverge.com" });
    assert.equal(verge.tier, 2);

    const cnbc = classifyPublisher({ name: "CNBC International", domain: "cnbc.com" });
    assert.equal(cnbc.tier, 2);

    const wired = classifyPublisher({ name: "Wired Magazine", url: "https://wired.com" });
    assert.equal(wired.tier, 2);
  });

  await t.test("classifies Tier 3 for regional, general, or unlisted blogs", () => {
    const localBlog = classifyPublisher({ name: "Daily Suburb Observer", url: "https://suburbnews.example.com" });
    assert.equal(localBlog.tier, 3);
    assert.equal(localBlog.weight, 0.45);
  });

  await t.test("aggregates publisher authority and awards multi-Tier-1 bonus", () => {
    const singleTier1 = computeAggregatePublisherAuthority([
      { name: "Reuters", url: "https://reuters.com" },
    ]);
    assert.equal(singleTier1.highestTier, 1);
    assert.equal(singleTier1.score, 1.0);

    const multiTier1 = computeAggregatePublisherAuthority([
      { name: "Reuters", url: "https://reuters.com" },
      { name: "BBC News", url: "https://bbc.com" },
      { name: "Bloomberg", url: "https://bloomberg.com" },
    ]);
    assert.equal(multiTier1.highestTier, 1);
    assert.equal(multiTier1.tier1Count, 3);
    assert.equal(multiTier1.score, 1.0); // Capped at 1.00

    const tier2And3 = computeAggregatePublisherAuthority([
      { name: "TechCrunch", url: "https://techcrunch.com" },
      { name: "Local Blog", url: "https://local.example.com" },
    ]);
    assert.equal(tier2And3.highestTier, 2);
    assert.equal(tier2And3.score, 0.75);
  });
});

test("Step 2K: Event & Entity Prominence", async (t) => {
  await t.test("detects central banks and macro policy shocks", () => {
    const res = evaluateEventProminence("Federal Reserve cuts interest rates by 50 basis points amidst inflation slowdown");
    assert.ok(res.score >= 0.4);
    assert.ok(res.signals.some((s) => s.includes("Central Bank")));
  });

  await t.test("detects global governance, heads of state, and geopolitics", () => {
    const res = evaluateEventProminence("White House announces comprehensive sanctions following UN Security Council vote");
    assert.ok(res.score >= 0.4);
    assert.ok(res.signals.some((s) => s.includes("Global Governance")));
  });

  await t.test("detects mega-cap tech and AI breakthroughs", () => {
    const res = evaluateEventProminence("OpenAI and Nvidia announce partnership on next-generation frontier AI clusters");
    assert.ok(res.score >= 0.35);
    assert.ok(res.signals.some((s) => s.includes("Frontier Tech")));
  });

  await t.test("gives baseline score and no signals for routine/niche articles", () => {
    const res = evaluateEventProminence("Local artisan bakery introduces weekend sourdough baking classes");
    assert.equal(res.score, 0.2);
    assert.equal(res.signals.length, 0);
  });
});

test("Step 2K: Coverage Breadth & Reporting Velocity", async (t) => {
  await t.test("coverage breadth scales sublinearly with unique sources and article depth", () => {
    const singleSource = computeCoverageBreadth(1, 1);
    assert.equal(singleSource, 0.2);

    const twoSources = computeCoverageBreadth(2, 2);
    assert.equal(twoSources, 0.45);

    const fourSources = computeCoverageBreadth(4, 4);
    assert.equal(fourSources, 0.78);

    const depthBonus = computeCoverageBreadth(2, 5); // 2 sources, but 5 articles total
    assert.ok(depthBonus > twoSources);
  });

  await t.test("reporting velocity reflects fast-breaking surge vs slow-burn", () => {
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Fast-breaking surge: 4 articles within 30 minutes
    const breakingVelocity = computeReportingVelocity(halfHourAgo, now, 4);
    assert.ok(breakingVelocity >= 0.8, `Expected breaking velocity >= 0.8, got ${breakingVelocity}`);

    // Slow burn: 2 articles spread across 48 hours
    const slowVelocity = computeReportingVelocity(twoDaysAgo, now, 2);
    assert.ok(slowVelocity < 0.45, `Expected slow velocity < 0.45, got ${slowVelocity}`);
  });
});

test("Step 2K: Composite Story Importance Scorer", async (t) => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  await t.test("scores major breaking wire consensus story as CRITICAL", () => {
    const result = computeStoryImportance({
      canonicalTitle: "Federal Reserve cuts benchmark interest rate by 50 basis points in emergency meeting",
      summary: "The central bank acted decisively to shore up market liquidity.",
      sourceCount: 4,
      articleCount: 6,
      firstPublishedAt: oneHourAgo,
      latestPublishedAt: now,
      sources: [
        { name: "Reuters", url: "https://reuters.com" },
        { name: "Bloomberg", url: "https://bloomberg.com" },
        { name: "Associated Press", url: "https://apnews.com" },
        { name: "The Wall Street Journal", url: "https://wsj.com" },
      ],
    });

    assert.ok(result.score >= 0.8, `Expected score >= 0.80, got ${result.score}`);
    assert.equal(result.level, "CRITICAL");
    assert.ok(result.signals.length >= 2);
    assert.ok(result.breakdown.coverageBreadth >= 0.8);
    assert.ok(result.breakdown.publisherAuthority >= 0.95);
  });

  await t.test("scores reputable industry tech story as HIGH or MEDIUM", () => {
    const result = computeStoryImportance({
      canonicalTitle: "Tech startup raises $25M Series B for AI workflow automation",
      sourceCount: 2,
      articleCount: 2,
      firstPublishedAt: oneHourAgo,
      latestPublishedAt: now,
      sources: [
        { name: "TechCrunch", url: "https://techcrunch.com" },
        { name: "VentureBeat", url: "https://venturebeat.com" },
      ],
    });

    assert.ok(result.score >= 0.45 && result.score < 0.8);
    assert.ok(result.level === "HIGH" || result.level === "MEDIUM");
  });

  await t.test("scores single-source niche blog post as LOW", () => {
    const result = computeStoryImportance({
      canonicalTitle: "Opinion: Why I switched text editors again this week",
      sourceCount: 1,
      articleCount: 1,
      firstPublishedAt: now,
      latestPublishedAt: now,
      sources: [
        { name: "Random Personal Blog", url: "https://myblog.example.com" },
      ],
    });

    assert.ok(result.score < 0.4, `Expected score < 0.40, got ${result.score}`);
    assert.equal(result.level, "LOW");
  });

  await t.test("sub-millisecond benchmark: 1,000 importance computations in < 25ms", () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      computeStoryImportance({
        canonicalTitle: `Story ${i}: Federal Reserve and White House announce new fiscal measure`,
        sourceCount: (i % 5) + 1,
        articleCount: (i % 8) + 1,
        firstPublishedAt: oneHourAgo,
        latestPublishedAt: now,
        sources: [
          { name: "Reuters", url: "https://reuters.com" },
          { name: "TechCrunch", url: "https://techcrunch.com" },
        ],
      });
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 25, `1,000 computations should take < 25ms, took ${elapsed.toFixed(2)}ms`);
  });
});

test("Step 2K: GET /api/stories with sortBy and minImportance", async (t) => {
  await t.test("schema validates sortBy='importance' and minImportance=0.5", () => {
    const parsed = storiesQuerySchema.safeParse({ sortBy: "importance", minImportance: "0.5" });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.sortBy, "importance");
      assert.equal(parsed.data.minImportance, 0.5);
    }
  });

  await t.test("schema defaults sortBy to 'recent'", () => {
    const parsed = storiesQuerySchema.safeParse({});
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.sortBy, "recent");
      assert.equal(parsed.data.minImportance, undefined);
    }
  });

  await t.test("returns 400 for invalid sortBy value", async () => {
    const req = new Request("http://localhost:3000/api/stories?sortBy=invalidSort");
    const res = await storiesRouteHandler(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test("returns 400 for out-of-range minImportance", async () => {
    const req = new Request("http://localhost:3000/api/stories?minImportance=2.5");
    const res = await storiesRouteHandler(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });
});
