import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { generateTopicDigest, type DigestPeriodType } from "../src/server/news/digests";
import { getServiceSupabaseClient } from "../src/server/supabase";
import { getFlashLiteModel, isAiEnabled, isGeminiConfigured } from "../src/server/ai";

async function main() {
  console.log("==================================================");
  console.log("Personal Intelligence — Topic Digest Generation");
  console.log("==================================================");

  const args = process.argv.slice(2);
  const force = args.includes("--force");

  // Parse --period daily / --period weekly
  let periodType: DigestPeriodType = "daily";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--period" && args[i + 1]) {
      const val = args[i + 1].toLowerCase();
      if (val === "daily" || val === "weekly") periodType = val;
    } else if (args[i].startsWith("--period=")) {
      const val = args[i].split("=")[1].toLowerCase();
      if (val === "daily" || val === "weekly") periodType = val;
    }
  }

  // Parse --user <userId>
  let userId: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user" && args[i + 1]) {
      userId = args[i + 1].trim();
    } else if (args[i].startsWith("--user=")) {
      userId = args[i].split("=")[1].trim();
    }
  }

  const client = getServiceSupabaseClient();

  // If userId not provided, locate an active user from user_category_preferences or user_preferences
  if (!userId) {
    try {
      const { data: prefRows } = await client
        .from("user_category_preferences")
        .select("user_id")
        .limit(1);

      if (prefRows && prefRows.length > 0 && prefRows[0].user_id) {
        userId = prefRows[0].user_id;
      } else {
        const { data: userPrefRows } = await client
          .from("user_preferences")
          .select("user_id")
          .limit(1);

        if (userPrefRows && userPrefRows.length > 0 && userPrefRows[0].user_id) {
          userId = userPrefRows[0].user_id;
        }
      }
    } catch {
      // Ignored
    }
  }

  if (!userId) {
    console.log("[Digest CLI] No registered user with topic preferences found.");
    console.log("[Digest CLI] Please pass a user ID: npm run digest:generate -- --user <user_id>");
    process.exit(0);
  }

  console.log(`[Digest CLI] Period:     ${periodType.toUpperCase()}`);
  console.log(`[Digest CLI] Target User: ${userId}`);
  console.log(`[Digest CLI] Force:       ${force}`);
  console.log(`[Digest CLI] AI Enabled:  ${isAiEnabled()}`);
  console.log(`[Digest CLI] Gemini Key:  ${isGeminiConfigured() ? "Configured" : "Not configured (will use fallback)"}`);
  console.log(`[Digest CLI] Model:       ${getFlashLiteModel()}`);
  console.log("--------------------------------------------------");

  try {
    const result = await generateTopicDigest({
      userId,
      periodType,
      force,
      client,
    });

    console.log(`\n[Digest CLI] Status:    ${result.generated ? "Generated" : "Loaded Existing (Cached)"}`);
    console.log(`[Digest CLI] Source:    ${result.source}`);
    console.log(`[Digest CLI] Title:     ${result.digest.title}`);
    console.log(`[Digest CLI] Stories:   ${result.digest.storyCount} total (${result.digest.importantStoryCount} important)`);
    console.log(`[Digest CLI] Window:    ${result.digest.periodStart} -> ${result.digest.periodEnd}`);
    console.log(`[Digest CLI] Time:      ${result.durationMs || 0}ms\n`);

    console.log("EXECUTIVE SUMMARY:");
    console.log(result.digest.executiveSummary);

    if (result.digest.keyDevelopments.length > 0) {
      console.log(`\nKEY DEVELOPMENTS (${result.digest.keyDevelopments.length}):`);
      result.digest.keyDevelopments.forEach((dev, idx) => {
        console.log(` ${idx + 1}. ${dev.headline}`);
        console.log(`    ${dev.explanation} [Story: ${dev.storyId}]`);
      });
    }

    if (result.digest.categoryHighlights.length > 0) {
      console.log(`\nCATEGORY HIGHLIGHTS:`);
      result.digest.categoryHighlights.forEach((cat) => {
        console.log(` - [${cat.categoryName}]: ${cat.summary}`);
      });
    }

    if (result.digest.opportunities.length > 0) {
      console.log(`\nOPPORTUNITIES:`);
      result.digest.opportunities.forEach((opp) => console.log(` • ${opp}`));
    }

    if (result.digest.risks.length > 0) {
      console.log(`\nRISKS:`);
      result.digest.risks.forEach((risk) => console.log(` ▲ ${risk}`));
    }

    console.log("\n==================================================");
    console.log("Personal Intelligence — Digest Complete");
    console.log("==================================================");
  } catch (err: unknown) {
    console.error("\n[Digest CLI] Error running digest generation:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
