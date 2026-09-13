import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import {
  processPendingStoryIntelligence,
  isGeminiConfigured,
  getFlashLiteModel,
  getFlashModel,
  isAiEnabled,
} from "../src/server/ai";

async function main() {
  console.log("==================================================");
  console.log("Personal Intelligence — Tiered Gemini AI Processing");
  console.log("==================================================");

  if (!isAiEnabled()) {
    console.log("[AI Pipeline] AI processing is disabled via AI_ENABLED=false.");
    process.exit(0);
  }

  if (!isGeminiConfigured()) {
    console.warn("[AI Pipeline] WARNING: GEMINI_API_KEY is not configured in .env.local.");
    console.warn("[AI Pipeline] Add GEMINI_API_KEY to .env.local to enable AI intelligence processing.");
    process.exit(0);
  }

  const args = process.argv.slice(2);
  const force = args.includes("--force");

  // Parse --limit 2 or --limit=2
  let limit: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
    } else if (args[i].startsWith("--limit=")) {
      limit = parseInt(args[i].split("=")[1], 10);
    }
  }

  // Parse --concurrency 2 or --concurrency=2
  let concurrency: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[i + 1], 10);
    } else if (args[i].startsWith("--concurrency=")) {
      concurrency = parseInt(args[i].split("=")[1], 10);
    }
  }

  console.log("[AI Pipeline] AI processing started");
  console.log(`[AI Pipeline] Flash-Lite Model: ${getFlashLiteModel()}`);
  console.log(`[AI Pipeline] Flash Model:      ${getFlashModel()}`);
  console.log(`[AI Pipeline] Options:          limit=${limit || "default"}, concurrency=${concurrency || 2}, force=${force}`);

  const stats = await processPendingStoryIntelligence({
    limit,
    concurrency,
    forceRegenerate: force,
  });

  console.log("\n--- Processing Report ---");
  console.log(`[AI Pipeline] Processed: ${stats.processed}`);
  console.log(`[AI Pipeline] Succeeded: ${stats.succeeded}`);
  console.log(`[AI Pipeline] Normal:    ${stats.normal}`);
  console.log(`[AI Pipeline] Important: ${stats.important}`);
  console.log(`[AI Pipeline] Failed:    ${stats.failed}`);
  if (stats.skipped > 0) {
    console.log(`[AI Pipeline] Skipped:   ${stats.skipped}`);
  }
  if (stats.rateLimited) {
    console.log(`[AI Pipeline] Rate-limited: YES (stopped batch safely to preserve quota)`);
  }
  console.log(`[AI Pipeline] Duration:     ${stats.durationMs}ms`);

  if (stats.errors.length > 0) {
    console.log("\nNotices / Errors:");
    stats.errors.forEach((err) => console.log(`- ${err}`));
  }

  console.log("==================================================");
}

main().catch((err) => {
  console.error("Fatal AI processing error:", err);
  process.exit(1);
});
