import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserPersonalizedFeed } from "@/server/news/relevance";
import { getDemoPreferences } from "../user/categories/route";

export const feedQuerySchema = z.object({
  limit: z
    .coerce
    .number({ message: "Limit must be a valid number" })
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(50, "Limit cannot exceed 50")
    .default(20),
  offset: z
    .coerce
    .number({ message: "Offset must be a valid number" })
    .int("Offset must be an integer")
    .min(0, "Offset cannot be negative")
    .default(0),
  mode: z
    .preprocess(
      (val) => {
        if (typeof val === "string") {
          const u = val.trim().toUpperCase();
          if (u === "TOPICS") return "CATEGORY";
          return u;
        }
        return val;
      },
      z.enum(["CATEGORY", "ALL"])
    )
    .optional(),
  categoryId: z
    .string()
    .trim()
    .min(1)
    .optional(),
  sortBy: z
    .enum(["relevance", "recent", "importance"])
    .default("relevance")
    .optional(),
  minImportance: z
    .coerce
    .number({ message: "minImportance must be a valid number" })
    .min(0, "minImportance must be at least 0")
    .max(1, "minImportance cannot exceed 1")
    .optional(),
});

export type FeedQueryInput = z.infer<typeof feedQuerySchema>;

/**
 * GET /api/feed
 *
 * Personalized intelligence feed endpoint.
 *
 * Returns stories ranked and annotated by user relevance based on
 * their explicit category choices, multi-category synergy, recency decay,
 * and global importance scoring.
 *
 * Query Parameters:
 * - limit: number (1-50, default 20)
 * - offset: number (>= 0, default 0)
 * - mode: 'CATEGORY' | 'ALL' | 'topics' | 'all' (optional override)
 * - categoryId: string (optional single category filter)
 * - sortBy: 'relevance' | 'recent' | 'importance' (default 'relevance')
 * - minImportance: number 0.0-1.0 (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const rawParams: Record<string, string> = {};
    const limitParam = searchParams.get("limit");
    if (limitParam !== null && limitParam.trim() !== "") {
      rawParams.limit = limitParam.trim();
    }
    const offsetParam = searchParams.get("offset");
    if (offsetParam !== null && offsetParam.trim() !== "") {
      rawParams.offset = offsetParam.trim();
    }
    const modeParam = searchParams.get("mode");
    if (modeParam !== null && modeParam.trim() !== "") {
      rawParams.mode = modeParam.trim();
    }
    const categoryIdParam = searchParams.get("categoryId");
    if (categoryIdParam !== null && categoryIdParam.trim() !== "") {
      rawParams.categoryId = categoryIdParam.trim();
    }
    const sortByParam = searchParams.get("sortBy");
    if (sortByParam !== null && sortByParam.trim() !== "") {
      rawParams.sortBy = sortByParam.trim();
    }
    const minImportanceParam = searchParams.get("minImportance");
    if (minImportanceParam !== null && minImportanceParam.trim() !== "") {
      rawParams.minImportance = minImportanceParam.trim();
    }

    const validation = feedQuerySchema.safeParse(rawParams);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { limit, offset, mode: queryMode, categoryId, sortBy, minImportance } = validation.data;

    // Security check: Check user authentication strictly from session
    // Never allow client to supply userId parameter to read another user's feed
    let userId: string | null = null;
    let fallbackCategoryIds: string[] | undefined = undefined;
    let fallbackMode: "CATEGORY" | "ALL" = queryMode || "CATEGORY";

    try {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!authError && user) {
        userId = user.id;
      }
    } catch {
      // Non-auth or testing contexts proceed to preview fallback
    }

    // In preview / unauthenticated mode, supply active demo preferences or default categories
    if (!userId) {
      const demoPrefs = getDemoPreferences();
      fallbackMode = queryMode || demoPrefs.mode || "CATEGORY";
      fallbackCategoryIds = categoryId ? [categoryId] : demoPrefs.categoryIds;
      if (!fallbackCategoryIds || fallbackCategoryIds.length === 0) {
        fallbackCategoryIds = ["technology-ai", "cat-tech", "technology"];
      }
    } else if (categoryId) {
      fallbackCategoryIds = [categoryId];
    }

    const result = await getUserPersonalizedFeed({
      userId,
      userCategoryIds: fallbackCategoryIds,
      selectionMode: queryMode || (userId ? undefined : fallbackMode),
      limit,
      offset,
      sortBy,
      minImportance,
    });

    return NextResponse.json(
      {
        success: true,
        mode: result.mode,
        stories: result.stories,
        feed: result.stories, // Backward-compatibility alias
        pagination: {
          limit: result.limit,
          offset: result.offset,
          count: result.count,
          hasMore: result.hasMore,
        },
        meta: {
          mode: result.mode,
          userCategoryCount: result.userCategoryCount,
          isPersonalized: result.mode === "CATEGORY",
          sortBy: sortBy || "relevance",
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Feed API] Error generating feed:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate personalized intelligence feed",
      },
      { status: 500 }
    );
  }
}
