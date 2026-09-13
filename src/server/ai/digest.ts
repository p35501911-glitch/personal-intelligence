import { Type, type GoogleGenAI } from "@google/genai";
import { getGeminiClient, getGeminiConfig, getFlashLiteModel } from "./client";
import { isRateLimitError } from "./service";
import {
  digestAiOutputSchema,
  type DigestAiOutput,
  type DigestPeriodType,
  type KeyDevelopmentItem,
  type CategoryHighlightItem,
} from "../news/digests/types";
import type { PersonalizedStoryItem } from "../news/relevance";

export interface CompactStoryForDigest {
  id: string;
  canonicalTitle: string;
  summary: string | null;
  intelligenceSummary?: string | null;
  keyPoints?: string[];
  importanceScore: number | null;
  importanceLevel: string;
  categories: string[];
  publishedAt: string;
  sourceCount: number;
}

export interface DigestSynthesisResult {
  success: boolean;
  data: DigestAiOutput;
  model: string;
  promptVersion: string;
  isFallback: boolean;
  error?: string;
}

const DIGEST_SYSTEM_INSTRUCTION = `You are an elite intelligence analyst producing an executive personal intelligence briefing.

CRITICAL GROUNDING RULES:
1. Use ONLY the supplied stories. Do NOT invent facts or introduce outside knowledge or unlisted events.
2. Every item in 'keyDevelopments' MUST specify the exact 'storyId' from the supplied list.
3. Every storyId in 'categoryHighlights' MUST come from the supplied story list.
4. Combine duplicate or related coverage into coherent developments.
5. Prioritize high-importance stories and emerging trends.
6. Keep the briefing concise, analytical, and decision-oriented.
7. Return valid JSON strictly matching the response schema.`;

const DIGEST_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Concise, executive briefing title for the period.",
    },
    executiveSummary: {
      type: Type.STRING,
      description: "High-level strategic briefing synthesizing overarching patterns (2 to 4 sentences).",
    },
    keyDevelopments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING, description: "Action-oriented headline." },
          explanation: { type: Type.STRING, description: "Why this development is significant and what occurred." },
          storyId: { type: Type.STRING, description: "The exact storyId from the provided candidate stories." },
        },
        required: ["headline", "explanation", "storyId"],
      },
      description: "Key developments grounded in the supplied stories (3-7 for daily, 5-10 for weekly).",
    },
    categoryHighlights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          categoryName: { type: Type.STRING, description: "Category name." },
          summary: { type: Type.STRING, description: "Synthesis of trends within this category." },
          storyIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of relevant supplied storyIds for this category.",
          },
        },
        required: ["categoryName", "summary", "storyIds"],
      },
      description: "Briefing highlights grouped by domain.",
    },
    opportunities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Strategic opportunities or tactical advantages supported by the stories (empty array if none).",
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Identified risks, vulnerabilities, or market uncertainties supported by the stories (empty array if none).",
    },
  },
  required: ["title", "executiveSummary", "keyDevelopments", "categoryHighlights", "opportunities", "risks"],
};

/**
 * Builds compact prompt string for digest synthesis.
 */
export function buildDigestPrompt(
  stories: CompactStoryForDigest[],
  periodType: DigestPeriodType,
  categoryNames: string[]
): string {
  const periodLabel = periodType === "daily" ? "Daily (Past 24 Hours)" : "Weekly (Past 7 Days)";
  const devRange = periodType === "daily" ? "3 to 7" : "5 to 10";

  let prompt = `Produce a ${periodLabel} Executive Intelligence Briefing.\n`;
  prompt += `Target Focus Areas: ${categoryNames.length > 0 ? categoryNames.join(", ") : "All Strategic Topics"}\n`;
  prompt += `Desired Key Developments: ${devRange}\n\n`;
  prompt += `CANDIDATE STORIES (${stories.length} stories provided):\n`;
  prompt += `====================================================================\n`;

  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];
    prompt += `[Story ${i + 1}]\n`;
    prompt += `storyId: "${s.id}"\n`;
    prompt += `Title: ${s.canonicalTitle}\n`;
    prompt += `Importance: ${s.importanceLevel} (score: ${s.importanceScore ?? "n/a"})\n`;
    prompt += `Categories: ${s.categories.join(", ") || "General"}\n`;
    prompt += `Published: ${s.publishedAt}\n`;
    prompt += `Publishers: ${s.sourceCount}\n`;
    if (s.intelligenceSummary) {
      prompt += `AI Executive Brief: ${s.intelligenceSummary}\n`;
    } else if (s.summary) {
      prompt += `Synopsis: ${s.summary}\n`;
    }
    if (s.keyPoints && s.keyPoints.length > 0) {
      prompt += `Key Takeaways:\n - ${s.keyPoints.slice(0, 3).join("\n - ")}\n`;
    }
    prompt += `--------------------------------------------------------------------\n`;
  }

  prompt += `\nRemember:\n`;
  prompt += `- You MUST reference the exact storyId in each key development.\n`;
  prompt += `- Do not hallucinate storyIds or events.\n`;
  prompt += `- Ground all opportunities and risks directly in the events described above.\n`;

  return prompt;
}

/**
 * Validates and strictly enforces that story IDs in AI output exist in the supplied story set.
 */
export function groundStoryIdsInAiOutput(
  output: DigestAiOutput,
  validStoryIds: Set<string>,
  fallbackStoryIds: string[]
): DigestAiOutput {
  const groundedDevelopments: KeyDevelopmentItem[] = [];

  for (const dev of output.keyDevelopments) {
    if (validStoryIds.has(dev.storyId)) {
      groundedDevelopments.push(dev);
    } else {
      // Find case-insensitive or partial match, or fallback to first available
      const matched = Array.from(validStoryIds).find(
        (id) => id.toLowerCase() === dev.storyId.toLowerCase() || dev.storyId.includes(id) || id.includes(dev.storyId)
      );
      if (matched) {
        groundedDevelopments.push({ ...dev, storyId: matched });
      }
    }
  }

  // If no developments had valid IDs, populate with top candidate stories
  if (groundedDevelopments.length === 0 && fallbackStoryIds.length > 0) {
    for (let i = 0; i < Math.min(3, fallbackStoryIds.length); i++) {
      groundedDevelopments.push({
        headline: output.keyDevelopments[i]?.headline || "Major Developing Story",
        explanation: output.keyDevelopments[i]?.explanation || output.executiveSummary,
        storyId: fallbackStoryIds[i],
      });
    }
  }

  // Sanitize categoryHighlights storyIds
  const groundedHighlights: CategoryHighlightItem[] = output.categoryHighlights.map((cat) => ({
    ...cat,
    storyIds: cat.storyIds.filter((id) => validStoryIds.has(id)),
  }));

  return {
    ...output,
    keyDevelopments: groundedDevelopments,
    categoryHighlights: groundedHighlights,
  };
}

/**
 * Builds a deterministic fallback digest when Gemini is disabled, rate-limited, or unavailable.
 * Strictly uses existing precomputed story intelligence and categories.
 */
export function buildDeterministicFallbackDigest(
  stories: PersonalizedStoryItem[],
  periodType: DigestPeriodType,
  categoryNames: string[]
): DigestAiOutput {
  const periodTitle = periodType === "daily" ? "Daily Intelligence Brief" : "Weekly Intelligence Brief";

  // Build executive summary from top 2-3 stories
  const topStories = stories.slice(0, 3);
  const summarySnippets = topStories
    .map((s) => s.intelligence?.summary || s.summary || s.canonicalTitle)
    .filter(Boolean);

  const focusAreaStr = categoryNames.length > 0 ? categoryNames.slice(0, 3).join(", ") : "key tracked sectors";
  const executiveSummary = summarySnippets.length > 0
    ? `Intelligence summary across ${focusAreaStr}: ${summarySnippets.join(" ")}`
    : `Briefing compiled for ${periodType} monitoring period across ${focusAreaStr}.`;

  // Key developments from top stories
  const keyDevelopments: KeyDevelopmentItem[] = stories.slice(0, periodType === "daily" ? 5 : 8).map((s) => {
    const explanation =
      s.intelligence?.whyItMatters ||
      s.intelligence?.summary ||
      s.summary ||
      `Multi-publisher coverage verified across ${s.sourceCount || 1} independent sources.`;
    return {
      headline: s.canonicalTitle,
      explanation,
      storyId: s.id,
    };
  });

  // Category highlights: group top stories by category name
  const categoryGroups = new Map<string, string[]>();
  for (const s of stories) {
    for (const cat of s.categories || []) {
      const name = cat.categoryName || "General";
      if (!categoryGroups.has(name)) {
        categoryGroups.set(name, []);
      }
      categoryGroups.get(name)!.push(s.id);
    }
  }

  const categoryHighlights: CategoryHighlightItem[] = [];
  for (const [catName, ids] of categoryGroups.entries()) {
    if (categoryHighlights.length >= 4) break;
    const catStories = stories.filter((s) => ids.includes(s.id));
    const catSummary = catStories.slice(0, 2).map((s) => s.canonicalTitle).join("; ");
    categoryHighlights.push({
      categoryName: catName,
      summary: `Active developments: ${catSummary}`,
      storyIds: ids.slice(0, 5),
    });
  }

  // Opportunities and risks gathered from precomputed intelligence
  const opportunitiesSet = new Set<string>();
  const risksSet = new Set<string>();

  for (const s of stories) {
    if (s.intelligence?.opportunities) {
      for (const opp of s.intelligence.opportunities) {
        if (opp && opp.trim().length > 0) opportunitiesSet.add(opp.trim());
      }
    }
    if (s.intelligence?.risks) {
      for (const risk of s.intelligence.risks) {
        if (risk && risk.trim().length > 0) risksSet.add(risk.trim());
      }
    }
  }

  return {
    title: periodTitle,
    executiveSummary,
    keyDevelopments: keyDevelopments.length > 0
      ? keyDevelopments
      : [
          {
            headline: "No Major Developments Recorded",
            explanation: "No qualifying news events were recorded in the selected categories for this time window.",
            storyId: stories[0]?.id || "fallback-id",
          },
        ],
    categoryHighlights,
    opportunities: Array.from(opportunitiesSet).slice(0, 5),
    risks: Array.from(risksSet).slice(0, 5),
  };
}

/**
 * Generates an executive intelligence briefing using Gemini Flash-Lite in a SINGLE API call,
 * with automatic fallback to deterministic synthesis on rate-limit, parsing, or network failure.
 */
export async function generateDigestSynthesis(
  stories: PersonalizedStoryItem[],
  periodType: DigestPeriodType,
  categoryNames: string[],
  options?: {
    model?: string;
    geminiClient?: GoogleGenAI | null;
    forceFallback?: boolean;
    maxRetries?: number;
    timeoutMs?: number;
  }
): Promise<DigestSynthesisResult> {
  const config = getGeminiConfig();
  const model = options?.model || getFlashLiteModel();
  const promptVersion = "v1-digest";

  // Check if AI is disabled or forced fallback requested
  if (options?.forceFallback || !config.enabled) {
    const fallbackData = buildDeterministicFallbackDigest(stories, periodType, categoryNames);
    return {
      success: true,
      data: fallbackData,
      model: "deterministic-fallback",
      promptVersion: "v1-fallback",
      isFallback: true,
    };
  }

  const client = options?.geminiClient ?? getGeminiClient();
  if (!client) {
    const fallbackData = buildDeterministicFallbackDigest(stories, periodType, categoryNames);
    return {
      success: true,
      data: fallbackData,
      model: "deterministic-fallback",
      promptVersion: "v1-fallback",
      isFallback: true,
      error: "GEMINI_API_KEY is not configured.",
    };
  }

  // Convert candidate stories to compact format
  const compactStories: CompactStoryForDigest[] = stories.map((s) => ({
    id: s.id,
    canonicalTitle: s.canonicalTitle,
    summary: s.summary,
    intelligenceSummary: s.intelligence?.summary,
    keyPoints: s.intelligence?.keyPoints,
    importanceScore: s.importanceScore,
    importanceLevel: s.importance,
    categories: (s.categories || []).map((c) => c.categoryName),
    publishedAt: s.latestPublishedAt || s.firstPublishedAt,
    sourceCount: s.sourceCount || 1,
  }));

  const validStoryIds = new Set<string>(stories.map((s) => s.id));
  const fallbackStoryIds = stories.map((s) => s.id);
  const promptText = buildDigestPrompt(compactStories, periodType, categoryNames);

  const maxRetries = options?.maxRetries ?? config.maxRetries;
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const generatePromise = client.models.generateContent({
        model,
        contents: promptText,
        config: {
          systemInstruction: DIGEST_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: DIGEST_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Digest request timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const rawText = response.text?.trim() || "";

      if (!rawText) {
        throw new Error("Empty response returned from Gemini digest model");
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (jsonErr) {
        throw new Error(`Invalid JSON from digest model: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
      }

      const validation = digestAiOutputSchema.safeParse(parsedJson);
      if (!validation.success) {
        const issues = validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`Digest schema mismatch: ${issues}`);
      }

      // Enforce grounding on story IDs
      const groundedData = groundStoryIdsInAiOutput(validation.data, validStoryIds, fallbackStoryIds);

      return {
        success: true,
        data: groundedData,
        model,
        promptVersion,
        isFallback: false,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (isRateLimitError(err)) {
        console.warn(`[Digest AI] Rate limited on ${model} (attempt ${attempt}/${maxRetries + 1}):`, lastError.message);
      } else {
        console.warn(`[Digest AI] Attempt ${attempt}/${maxRetries + 1} failed:`, lastError.message);
      }

      if (attempt <= maxRetries) {
        // Brief sleep before retry
        await new Promise((res) => setTimeout(res, 500 * attempt));
      }
    }
  }

  // Graceful deterministic fallback on failure
  console.warn(`[Digest AI] Falling back to deterministic digest synthesis: ${lastError?.message || "Unknown error"}`);
  const fallbackData = buildDeterministicFallbackDigest(stories, periodType, categoryNames);

  return {
    success: true,
    data: fallbackData,
    model: "deterministic-fallback",
    promptVersion: "v1-fallback",
    isFallback: true,
    error: lastError?.message,
  };
}
