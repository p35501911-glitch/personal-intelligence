import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

// Dependency-correct order (NOT alphabetical).
const order = [
  "20260913_article_database.sql",
  "20260913_article_deduplication.sql",
  "20260913_category_system.sql",
  "20260913_story_cluster_model.sql",
  "20260913_category_matching.sql",
  "20260913_story_importance.sql",
  "20260913_story_intelligence.sql",
  "20260913_user_preferences.sql",
  "20260913_user_saved_stories.sql",
  "20260914_system_job_runs.sql",
  "20260914_topic_digests.sql",
  "20260914_rls_security_hardening.sql",
];

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("[migrate] No POSTGRES_URL_NON_POOLING/POSTGRES_URL set");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("[migrate] connected");
  for (const file of order) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    process.stdout.write(`[migrate] applying ${file} ... `);
    try {
      await client.query(sql);
      console.log("OK");
    } catch (err) {
      console.log("FAILED");
      console.error(`[migrate] error in ${file}: ${err.message}`);
      throw err;
    }
  }
  console.log("[migrate] all migrations applied");
  await client.end();
}

main().catch(async (err) => {
  try {
    await client.end();
  } catch {}
  console.error("[migrate] aborted:", err.message);
  process.exit(1);
});
