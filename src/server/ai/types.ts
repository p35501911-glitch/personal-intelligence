import { z } from "zod";

/**
 * Validated structured output schema for Gemini Intelligence Generation.
 */
export const storyIntelligenceSchema = z.object({
  summary: z
    .string({ message: "Summary must be a string" })
    .min(15, "Summary must be at least 15 characters")
    .max(800, "Summary cannot exceed 800 characters"),
  keyPoints: z
    .array(z.string().min(5, "Key point must be at least 5 characters"))
    .min(2, "Must include at least 2 key points")
    .max(6, "Cannot exceed 6 key points"),
  whyItMatters: z
    .string({ message: "Why it matters must be a string" })
    .min(10, "Why it matters must be at least 10 characters")
    .max(500, "Why it matters cannot exceed 500 characters"),
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
  model: string;
  promptVersion: number;
  batchSize: number;
  timeoutMs: number;
  maxRetries: number;
}
