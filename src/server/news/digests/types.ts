import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { GoogleGenAI } from "@google/genai";
import type { PersonalizedStoryItem } from "../relevance";

export type DigestPeriodType = "daily" | "weekly";

export const keyDevelopmentSchema = z.object({
  headline: z.string().trim().min(1, "Headline is required"),
  explanation: z.string().trim().min(1, "Explanation is required"),
  storyId: z.string().trim().min(1, "storyId is required"),
});

export type KeyDevelopmentItem = z.infer<typeof keyDevelopmentSchema>;

export const categoryHighlightSchema = z.object({
  categoryName: z.string().trim().min(1, "Category name is required"),
  summary: z.string().trim().min(1, "Summary is required"),
  storyIds: z.array(z.string().trim()).default([]),
});

export type CategoryHighlightItem = z.infer<typeof categoryHighlightSchema>;

export const digestAiOutputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  executiveSummary: z.string().trim().min(1, "Executive summary is required"),
  keyDevelopments: z.array(keyDevelopmentSchema).min(1, "At least one key development is required"),
  categoryHighlights: z.array(categoryHighlightSchema).default([]),
  opportunities: z.array(z.string().trim()).default([]),
  risks: z.array(z.string().trim()).default([]),
});

export type DigestAiOutput = z.infer<typeof digestAiOutputSchema>;

export interface DigestStory {
  id: string;
  digestId: string;
  storyId: string;
  rank: number;
  importanceScore: number | null;
  isImportant: boolean;
  story?: PersonalizedStoryItem | null;
}

export interface TopicDigest {
  id: string;
  userId: string;
  periodType: DigestPeriodType;
  periodStart: string;
  periodEnd: string;
  title: string;
  executiveSummary: string;
  keyDevelopments: KeyDevelopmentItem[];
  categoryHighlights: CategoryHighlightItem[];
  opportunities: string[];
  risks: string[];
  storyCount: number;
  importantStoryCount: number;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
  stories?: DigestStory[];
}

export interface DigestGenerationResult {
  digest: TopicDigest;
  generated: boolean;
  source: "gemini" | "fallback" | "existing";
  durationMs?: number;
}

export interface DigestGenerationOptions {
  userId: string;
  periodType: DigestPeriodType;
  referenceTime?: Date;
  force?: boolean;
  model?: string;
  client?: SupabaseClient<Database>;
  geminiClient?: GoogleGenAI | null;
}

export interface DigestFetchOptions {
  periodType?: DigestPeriodType;
  limit?: number;
  offset?: number;
}

export interface DigestListResult {
  digests: TopicDigest[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
}
