import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { processPendingStoryIntelligence, isGeminiConfigured } from "../src/server/ai";

async function main() {
  console.log("==================================================");
  console.log("Personal Intelligence — Gemini AI Story Processing");
  console.log("==================================================");

  if (!isGeminiConfigured()) {
    console.warn("WARNING: GEMINI_API_KEY is not configured in .env.local.");
    console.warn("Please add GEMINI_API_KEY to .env.local to enable AI intelligence processing.");
    process.exit(0);
  }

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log(`Starting AI intelligence batch processing (limit: ${limit || "default"}, force: ${force})...`);
  const stats = await processPendingStoryIntelligence({
    limit,
    forceRegenerate: force,
  });

  console.log("\n--- Processing Report ---");
  console.log(`Eligible stories: ${stats.totalEligible}`);
  console.log(`Processed:        ${stats.processed}`);
  console.log(`Succeeded:        ${stats.succeeded}`);
  console.log(`Failed:           ${stats.failed}`);
  console.log(`Rate-limited:     ${stats.rateLimited ? "YES (stopped batch safely)" : "NO"}`);
  console.log(`Duration:         ${stats.durationMs}ms`);

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
