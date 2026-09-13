import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

// Load environment variables from .env.local
const envLocal = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
}

import { getServiceSupabaseClient } from "../src/server/supabase";
import {
  categorizeAndTagArticle,
  categorizeAndTagStory,
  resetCategoryCache,
} from "../src/server/news/categories/service";

async function backfill() {
  console.log("=== Starting Category Backfill for Supabase ===");
  const client = getServiceSupabaseClient();
  resetCategoryCache();

  // 1. Verify categories table exists
  const { data: catData, error: catErr } = await client
    .from("categories")
    .select("id, slug, name")
    .limit(10);

  if (catErr || !catData || catData.length === 0) {
    console.error("Error: categories table not accessible or empty. Please ensure migration 20260913_category_matching.sql has been applied in Supabase.");
    process.exit(1);
  }

  console.log(`Verified categories table accessible (${catData.length}+ categories present).`);

  // 2. Classify and tag all articles
  const { data: articles, error: artErr } = await client
    .from("articles")
    .select("id, title, description, content");

  if (artErr) {
    console.error("Failed to query articles:", artErr.message);
  } else {
    console.log(`Found ${(articles || []).length} articles to classify...`);
    let articleTagCount = 0;

    for (const art of articles || []) {
      const matches = await categorizeAndTagArticle(
        {
          id: art.id,
          title: art.title,
          description: art.description,
          content: art.content,
        },
        client
      );
      if (matches.length > 0) {
        articleTagCount++;
        const primary = matches.find((m) => m.isPrimary);
        console.log(`  ✓ Article "${art.title.slice(0, 50)}..." -> [${primary?.categoryName}] (${matches.length} tags)`);
      } else {
        console.log(`  - Article "${art.title.slice(0, 50)}..." -> [No high-confidence match]`);
      }
    }

    console.log(`Classified and tagged ${articleTagCount}/${(articles || []).length} articles.`);
  }

  // 3. Classify and tag all stories
  const { data: stories, error: storyErr } = await client
    .from("stories")
    .select("id, canonical_title, summary");

  if (storyErr) {
    console.error("Failed to query stories:", storyErr.message);
  } else {
    console.log(`Found ${(stories || []).length} stories to classify...`);
    let storyTagCount = 0;

    for (const st of stories || []) {
      const matches = await categorizeAndTagStory(
        {
          id: st.id,
          canonicalTitle: st.canonical_title,
          summary: st.summary,
        },
        client
      );
      if (matches.length > 0) {
        storyTagCount++;
        const primary = matches.find((m) => m.isPrimary);
        console.log(`  ✓ Story "${st.canonical_title.slice(0, 50)}..." -> [${primary?.categoryName}] (${matches.length} tags)`);
      } else {
        console.log(`  - Story "${st.canonical_title.slice(0, 50)}..." -> [No high-confidence match]`);
      }
    }

    console.log(`Classified and tagged ${storyTagCount}/${(stories || []).length} stories.`);
  }

  console.log("=== Category Backfill Complete ===");
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
