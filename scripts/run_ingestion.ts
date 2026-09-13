/**
 * CLI News Ingestion Runner
 *
 * Runs an end-to-end news ingestion cycle from the terminal or scheduler.
 *
 * Usage:
 *   npx tsx scripts/run_ingestion.ts
 *   npm run ingest
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { runIngestionCycle } from "../src/server/news/worker";

async function main() {
  console.log("==================================================");
  console.log("Personal Intelligence — Ingestion Worker Pipeline");
  console.log("==================================================\n");

  const startTime = Date.now();
  const report = await runIngestionCycle({
    limitPerProvider: 30,
  });

  console.log(`\nCycle ID: ${report.id}`);
  console.log(`Status:   ${report.status.toUpperCase()}`);
  console.log(`Duration: ${(report.durationMs / 1000).toFixed(2)}s`);
  console.log("\n--- Provider Breakdown ---");

  for (const [provider, stats] of Object.entries(report.providerStats)) {
    console.log(
      `  [${provider.toUpperCase()}] Fetched: ${stats.fetched} | Inserted: ${stats.inserted} | Skipped: ${stats.skipped} | Failed: ${stats.failed} (${stats.durationMs}ms)`
    );
  }

  console.log("\n--- Pipeline Totals ---");
  console.log(`  Total Fetched:  ${report.totalArticlesFetched}`);
  console.log(`  Total Inserted: ${report.totalArticlesInserted}`);
  console.log(`  Total Skipped:  ${report.totalArticlesSkipped}`);
  console.log(`  Total Failed:   ${report.totalArticlesFailed}`);

  if (report.errors.length > 0) {
    console.log("\n--- Errors Encountered ---");
    for (const err of report.errors) {
      console.error(`  ✖ ${err}`);
    }
  }

  console.log(`\nCompleted in ${((Date.now() - startTime) / 1000).toFixed(2)}s.`);

  if (report.status === "failed") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[Worker] Fatal error running ingestion cycle:", err);
  process.exit(1);
});
