import { z } from "zod";

/**
 * Validated structured output schema for Flash-Lite Triage (Relevance + Categorization + Selection).
 */
export const flashLiteTriageSchema = z.object({
  relevant: z.boolean().describe("Whether the story is relevant to news/intelligence domains"),
  categorySlugs: z
    .array(z.string())
    .min(1, "Must assign at least 1 category")
    .max(3, "Cannot assign more than 3 categories"),
  importanceScore: z
    .number()
    .min(0.0, "Importance score minimum is 0.0")
    .max(1.0, "Importance score maximum is 1.0"),
  tier: z.enum(["normal", "important"]).describe("Normal (< 0.7) or Important (>= 0.7)"),
  summary: z.string().default(""),
  keyPoints: z.array(z.string()).default([]),
});

export type FlashLiteTriageResult = z.infer<typeof flashLiteTriageSchema>;

/**
 * Validated structured output schema for Flash Deep Intelligence Generation.
 */
export const deepStoryIntelligenceSchema = z.object({
  executiveSummary: z
    .string({ message: "Executive summary must be a string" })
    .min(15, "Executive summary must be at least 15 characters")
    .max(1000, "Executive summary cannot exceed 1000 characters"),
  keyTakeaways: z
    .array(z.string().min(5, "Takeaway must be at least 5 characters"))
    .min(2, "Must include at least 2 key takeaways")
    .max(6, "Cannot exceed 6 key takeaways"),
  whyItMatters: z
    .string({ message: "Why it matters must be a string" })
    .min(10, "Why it matters must be at least 10 characters")
    .max(600, "Why it matters cannot exceed 600 characters"),
  opportunities: z
    .array(z.string())
    .default([]),
  risks: z
    .array(z.string())
    .default([]),
});

export type DeepStoryIntelligenceData = z.infer<typeof deepStoryIntelligenceSchema>;

/**
 * General story intelligence schema supporting both normal (Flash-Lite) and important (Flash).
 */
export const storyIntelligenceSchema = z.object({
  tier: z.enum(["normal", "important"]).default("normal"),
  summary: z
    .string({ message: "Summary must be a string" })
    .min(10, "Summary must be at least 10 characters")
    .max(1000, "Summary cannot exceed 1000 characters"),
  keyPoints: z
    .array(z.string().min(5, "Key point must be at least 5 characters"))
    .min(1, "Must include at least 1 key point")
    .max(6, "Cannot exceed 6 key points"),
  whyItMatters: z
    .string()
    .default(""),
  opportunities: z
    .array(z.string())
    .default([]),
  risks: z
    .array(z.string())
    .default([]),
});

export type StoryIntelligenceData = z.infer<typeof storyIntelligenceSchema>;

export interface StoryInputForAI {
  id: string;
  canonicalTitle: string;
  summary?: string | null;
  firstPublishedAt?: string | null;
  latestPublishedAt?: string | null;
  articleCount?: number;
  sourceCount?: number;
  sources?: Array<{ name: string; url?: string | null }>;
  categories?: Array<{ categoryName: string; isPrimary?: boolean }>;
  articlesPreview?: Array<{
    title: string;
    publisher?: string;
    description?: string | null;
    content?: string | null;
  }>;
}

export interface StoryIntelligenceRecord extends StoryIntelligenceData {
  id: string;
  storyId: string;
  model: string;
  tier: "normal" | "important";
  promptVersion: number;
  status: "pending" | "completed" | "failed";
  errorMessage?: string | null;
  attempts: number;
  lastAttemptAt: string;
  generatedAt: string;
  updatedAt: string;
}

export interface GeminiEngineConfig {
  apiKey?: string;
  flashLiteModel: string;
  flashModel: string;
  importantThreshold: number;
  promptVersion: number;
  batchSize: number;
  concurrency: number;
  timeoutMs: number;
  maxRetries: number;
  enabled: boolean;
  model: string; // compatibility fallback
}
