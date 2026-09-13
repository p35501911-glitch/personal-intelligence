import { Type, type GoogleGenAI } from "@google/genai";
import { getGeminiClient, getGeminiConfig } from "./client";
import { buildStoryPrompt, GEMINI_SYSTEM_INSTRUCTION } from "./prompts";
import {
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
 * Structured response schema for Gemini SDK.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Concise executive summary of the story event (2 to 4 sentences).",
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 to 5 crucial facts or key takeaways.",
    },
    whyItMatters: {
      type: Type.STRING,
      description: "Why this event matters strategically or economically (1 to 2 sentences).",
    },
    opportunities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1 to 3 potential opportunities created by this development.",
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1 to 3 potential risks or uncertainties to watch.",
    },
  },
  required: ["summary", "keyPoints", "whyItMatters", "opportunities", "risks"],
};

/**
 * Generates structured intelligence for a news story using Google Gemini.
 *
 * Features:
 * - Structured JSON schema enforcement with Zod validation.
 * - 429 Rate-limit detection and exponential backoff.
 * - Timeout protection.
 * - Fault tolerance (never crashes the caller).
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
  const startTime = Date.now();
  const config = getGeminiConfig();
  const model = options?.model || config.model;
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
      // Execute generateContent with timeout race
      const generatePromise = client.models.generateContent({
        model,
        contents: promptText,
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0.2, // Low temperature for deterministic, factual intelligence
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const rawText = response.text?.trim() || "";

      if (!rawText) {
        throw new Error("Empty response returned from Gemini model");
      }

      // Parse and validate structured output with Zod
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (jsonErr) {
        throw new Error(`Failed to parse Gemini JSON output: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
      }

      const validation = storyIntelligenceSchema.safeParse(parsedJson);
      if (!validation.success) {
        const issues = validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`Invalid intelligence schema: ${issues}`);
      }

      return {
        success: true,
        data: validation.data,
        model,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      isRateLimited = isRateLimitError(lastError);

      if (isRateLimited) {
        console.warn(`[Gemini] Rate limit encountered for story "${story.canonicalTitle}" (attempt ${attempt}/${maxRetries + 1}).`);
      } else {
        console.warn(`[Gemini] Error generating intelligence for story "${story.canonicalTitle}" (attempt ${attempt}/${maxRetries + 1}): ${lastError.message}`);
      }

      if (attempt <= maxRetries) {
        // Backoff: on 429 wait 4s, otherwise wait 1.5s
        const backoffMs = isRateLimited ? 4000 * Math.pow(1.5, attempt - 1) : 1500;
        await sleep(backoffMs);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Generation failed",
    isRateLimited,
    model,
    durationMs: Date.now() - startTime,
  };
}
