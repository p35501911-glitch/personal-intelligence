import { Type, type GoogleGenAI } from "@google/genai";
import { getGeminiClient, getGeminiConfig } from "./client";
import { buildStoryPrompt, GEMINI_SYSTEM_INSTRUCTION } from "./prompts";
import {
  deepStoryIntelligenceSchema,
  storyIntelligenceSchema,
  type StoryIntelligenceData,
  type StoryInputForAI,
} from "./types";

export interface GenerationResult {
  success: boolean;
  data?: StoryIntelligenceData;
  error?: string;
  isRateLimited?: boolean;
  model: string;
  durationMs: number;
}

/**
 * Checks whether an error is a Gemini 429 / Quota / Rate-limit issue.
 */
export function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as { status?: number; statusCode?: number })?.status ||
    (err as { status?: number; statusCode?: number })?.statusCode;

  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("quota exceeded") ||
    msg.includes("too many requests")
  );
}

/**
 * Sleep helper for rate-limit backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Structured response schema for deep Flash model analysis.
 */
const DEEP_FLASH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    executiveSummary: {
      type: Type.STRING,
      description: "Concise, factual executive summary of the story event (2 to 4 sentences).",
    },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 to 5 crucial facts or key takeaways.",
    },
    whyItMatters: {
      type: Type.STRING,
      description: "Why this event matters strategically, technologically, or economically (1 to 2 sentences).",
    },
    opportunities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1 to 3 potential opportunities created by this development (or empty array if not applicable).",
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1 to 3 potential risks or uncertainties to watch (or empty array if not applicable).",
    },
  },
  required: ["executiveSummary", "keyTakeaways", "whyItMatters", "opportunities", "risks"],
};

/**
 * Generates deep strategic intelligence for an Important story using the Flash model.
 *
 * Called ONLY for stories meeting the importance threshold (>= 0.7).
 */
export async function generateImportantStoryIntelligence(
  story: StoryInputForAI,
  options?: {
    client?: GoogleGenAI | null;
    model?: string;
    maxRetries?: number;
    timeoutMs?: number;
  }
): Promise<GenerationResult> {
  const startTime = Date.now();
  const config = getGeminiConfig();
  const model = options?.model || config.flashModel;
  const maxRetries = options?.maxRetries ?? config.maxRetries;
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;

  const client = options?.client ?? getGeminiClient();
  if (!client) {
    return {
      success: false,
      error: "GEMINI_API_KEY is not configured.",
      model,
      durationMs: Date.now() - startTime,
    };
  }

  const promptText = buildStoryPrompt(story);
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
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: DEEP_FLASH_RESPONSE_SCHEMA,
          temperature: 0.2, // Low temperature for deterministic, grounded intelligence
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Flash request timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const rawText = response.text?.trim() || "";

      if (!rawText) {
        throw new Error("Empty response returned from Flash model");
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (jsonErr) {
        throw new Error(`Failed to parse Flash JSON output: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
      }

      // Check deep schema
      const deepValidation = deepStoryIntelligenceSchema.safeParse(parsedJson);
      if (deepValidation.success) {
        const d = deepValidation.data;
        const normalizedData: StoryIntelligenceData = {
          tier: "important",
          summary: d.executiveSummary,
          keyPoints: d.keyTakeaways,
          whyItMatters: d.whyItMatters,
          opportunities: d.opportunities,
          risks: d.risks,
        };
        return {
          success: true,
          data: normalizedData,
          model,
          durationMs: Date.now() - startTime,
        };
      }

      // Fallback check on standard storyIntelligenceSchema
      const standardValidation = storyIntelligenceSchema.safeParse(parsedJson);
      if (standardValidation.success) {
        return {
          success: true,
          data: {
            ...standardValidation.data,
            tier: "important",
          },
          model,
          durationMs: Date.now() - startTime,
        };
      }

      const issues = deepValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid intelligence schema: ${issues}`);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      isRateLimited = isRateLimitError(lastError);

      if (isRateLimited) {
        console.warn(`[Flash] Rate limit encountered for story "${story.canonicalTitle}" (attempt ${attempt}/${maxRetries + 1}).`);
        // Confirmed quota exhaustion: do not repeatedly retry
        break;
      } else {
        console.warn(`[Flash] Error generating intelligence for story "${story.canonicalTitle}" (attempt ${attempt}/${maxRetries + 1}): ${lastError.message}`);
      }

      if (attempt <= maxRetries) {
        const backoffMs = 1500 * Math.pow(2, attempt - 1);
        await sleep(backoffMs);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Flash generation failed",
    isRateLimited,
    model,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Standard entry point for story intelligence generation.
 */
export async function generateStoryIntelligence(
  story: StoryInputForAI,
  options?: {
    client?: GoogleGenAI | null;
    model?: string;
    maxRetries?: number;
    timeoutMs?: number;
  }
): Promise<GenerationResult> {
  return generateImportantStoryIntelligence(story, options);
}
