import { Type, type GoogleGenAI } from "@google/genai";
import { TAXONOMY_SEED } from "@/lib/data/categories-seed";
import type { CategoryNode } from "@/types/category";
import { getGeminiClient, getGeminiConfig } from "./client";
import { isRateLimitError } from "./service";
import {
  flashLiteTriageSchema,
  type FlashLiteTriageResult,
  type StoryInputForAI,
} from "./types";

/**
 * Builds a lookup map and comma-separated slug list of all canonical taxonomy categories.
 */
function buildTaxonomyLookup(): { slugSet: Set<string>; slugListText: string } {
  const slugSet = new Set<string>();
  const descriptions: string[] = [];

  function walk(nodes: CategoryNode[]) {
    for (const node of nodes) {
      slugSet.add(node.slug);
      descriptions.push(`${node.slug} (${node.name}: ${node.description || node.name})`);
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(TAXONOMY_SEED);
  return { slugSet, slugListText: descriptions.join("\n") };
}

const TAXONOMY = buildTaxonomyLookup();

/**
 * Checks whether a given slug exists in the taxonomy.
 */
export function isValidTaxonomySlug(slug: string): boolean {
  return TAXONOMY.slugSet.has(slug);
}

/**
 * Returns all valid taxonomy slugs as an array.
 */
export function getAllTaxonomySlugs(): string[] {
  return Array.from(TAXONOMY.slugSet);
}

export interface ClassifierResult {
  success: boolean;
  data: FlashLiteTriageResult;
  model: string;
  isRateLimited?: boolean;
  error?: string;
  durationMs: number;
}

const FLASH_LITE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    relevant: {
      type: Type.BOOLEAN,
      description: "True if this story is a meaningful, real-world news event. False if spam or gibberish.",
    },
    categorySlugs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1 to 3 category slugs chosen STRICTLY from the allowed taxonomy list.",
    },
    importanceScore: {
      type: Type.NUMBER,
      description: "Significance rating between 0.0 (trivial) and 1.0 (major global/industry event).",
    },
    tier: {
      type: Type.STRING,
      enum: ["normal", "important"],
      description: "'normal' if importanceScore < threshold (default 0.7), 'important' if importanceScore >= threshold.",
    },
    summary: {
      type: Type.STRING,
      description: "Concise 1 to 2 sentence summary of the news story (required if normal tier).",
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 to 3 concise takeaway bullet points (required if normal tier).",
    },
  },
  required: ["relevant", "categorySlugs", "importanceScore", "tier"],
};

/**
 * Cleans input text to strip HTML and limit token usage.
 */
function cleanText(text: string, maxChars = 500): string {
  if (!text) return "";
  const stripped = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length > maxChars ? stripped.slice(0, maxChars) + "..." : stripped;
}

/**
 * Builds the triage prompt for Flash-Lite.
 */
export function buildFlashLiteTriagePrompt(story: StoryInputForAI, threshold: number): string {
  const articles = story.articlesPreview || [];
  const articlesSnippet = articles
    .slice(0, 3)
    .map((a, idx) => `[Article ${idx + 1} - ${a.publisher || "Source"}]: ${cleanText(a.title, 150)}\n${cleanText(a.description || a.content || "", 350)}`)
    .join("\n\n");

  const existingCats = story.categories?.map((c) => c.categoryName).join(", ") || "None";

  return `You are a high-speed intelligence classifier and editor for a personalized newsfeed.
Classify the following news story into the provided taxonomy categories, evaluate its relevance and importance, decide its processing tier, and provide a concise summary if it is a normal-tier story.

=== ALLOWED CATEGORY SLUGS (CHOOSE 1 TO 3 STRICTLY FROM THIS LIST) ===
${TAXONOMY.slugListText}

=== IMPORTANCE THRESHOLD ===
Threshold: ${threshold}
- If importanceScore < ${threshold}: set tier = "normal"
- If importanceScore >= ${threshold}: set tier = "important"

=== REQUIREMENTS ===
1. categorySlugs: Choose 1 to 3 valid slugs from the allowed list above that best match this story. NEVER invent slugs.
2. importanceScore: Rate significance from 0.0 to 1.0 based on impact, magnitude, and credible publisher coverage.
3. relevant: Set true for legitimate news, false for promotional spam or gibberish.
4. If tier is "normal":
   - Provide a factual 1 to 2 sentence executive brief in "summary".
   - Provide 2 to 3 concise bullet points in "keyPoints".
5. If tier is "important":
   - summary and keyPoints may be brief placeholders, as a deep synthesis model will process it next.

=== STORY TO CLASSIFY ===
Canonical Title: ${cleanText(story.canonicalTitle, 200)}
Existing Matched Tags: ${existingCats}
Published Date: ${story.latestPublishedAt || story.firstPublishedAt || "Recent"}

Related Coverage:
${articlesSnippet || cleanText(story.summary || "", 400) || "No additional body text."}
`;
}

/**
 * Sleep helper for retries.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes Flash-Lite triage: single-call categorization, relevance evaluation,
 * importance scoring, and normal-story brief generation.
 */
export async function classifyStoryWithFlashLite(
  story: StoryInputForAI,
  options?: {
    client?: GoogleGenAI | null;
    model?: string;
    threshold?: number;
    maxRetries?: number;
    timeoutMs?: number;
  }
): Promise<ClassifierResult> {
  const startTime = Date.now();
  const config = getGeminiConfig();
  const model = options?.model || config.flashLiteModel;
  const threshold = options?.threshold ?? config.importantThreshold;
  const maxRetries = options?.maxRetries ?? config.maxRetries;
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;

  const client = options?.client ?? getGeminiClient();

  // Fallback data when Gemini is unconfigured or disabled
  const fallbackData: FlashLiteTriageResult = {
    relevant: true,
    categorySlugs: ["technology"],
    importanceScore: 0.5,
    tier: "normal",
    summary: story.summary || story.canonicalTitle,
    keyPoints: [story.canonicalTitle],
  };

  if (!client) {
    return {
      success: false,
      data: fallbackData,
      model,
      error: "GEMINI_API_KEY is not configured.",
      durationMs: Date.now() - startTime,
    };
  }

  const promptText = buildFlashLiteTriagePrompt(story, threshold);
  let attempt = 0;
  let lastError: Error | null = null;
  let isRateLimited = false;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const generatePromise = client.models.generateContent({
        model,
        contents: promptText,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: FLASH_LITE_RESPONSE_SCHEMA,
          temperature: 0.1, // Low temperature for high classification precision
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Flash-Lite request timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const rawText = response.text?.trim() || "";

      if (!rawText) {
        throw new Error("Empty response from Flash-Lite");
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (e) {
        throw new Error(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
      }

      const parsed = flashLiteTriageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`Invalid Flash-Lite triage schema: ${issues}`);
      }

      const data = parsed.data;

      // 1. Sanitize and validate category slugs against canonical taxonomy
      const validSlugs = data.categorySlugs.filter((s) => TAXONOMY.slugSet.has(s));
      if (validSlugs.length === 0) {
        // Fall back to closest existing or default category
        validSlugs.push("technology");
      }
      data.categorySlugs = validSlugs.slice(0, 3);

      // 2. Bound importance score
      data.importanceScore = Math.max(0.0, Math.min(1.0, data.importanceScore));

      // 3. Enforce deterministic tier alignment based on threshold
      data.tier = data.importanceScore >= threshold ? "important" : "normal";

      // 4. Ensure normal items have minimum valid summary and keyPoints
      if (data.tier === "normal") {
        if (!data.summary || data.summary.trim().length < 10) {
          data.summary = story.summary || story.canonicalTitle;
        }
        if (!data.keyPoints || data.keyPoints.length === 0) {
          data.keyPoints = [story.canonicalTitle];
        }
      }

      return {
        success: true,
        data,
        model,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      isRateLimited = isRateLimitError(lastError);

      if (isRateLimited) {
        console.warn(`[Flash-Lite] Rate limit encountered for "${story.canonicalTitle}" (attempt ${attempt}/${maxRetries + 1}).`);
      } else {
        console.warn(`[Flash-Lite] Error classifying "${story.canonicalTitle}" (attempt ${attempt}/${maxRetries + 1}): ${lastError.message}`);
      }

      if (attempt <= maxRetries) {
        const backoffMs = isRateLimited ? 4000 : 1500;
        await sleep(backoffMs);
      }
    }
  }

  return {
    success: false,
    data: fallbackData,
    model,
    isRateLimited,
    error: lastError?.message || "Flash-Lite classification failed",
    durationMs: Date.now() - startTime,
  };
}
