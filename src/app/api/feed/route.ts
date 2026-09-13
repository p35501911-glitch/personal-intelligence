import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserPersonalizedFeed } from "@/server/news/relevance";

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
});

export type FeedQueryInput = z.infer<typeof feedQuerySchema>;

/**
 * GET /api/feed
 *
 * Personalized intelligence feed endpoint.
 *
 * Returns stories ranked and annotated by user relevance based on
 * their explicit category choices, multi-category synergy, and recency decay.
 *
 * Query Parameters:
 * - limit: number (1-50, default 20)
 * - offset: number (>= 0, default 0)
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

    const { limit, offset } = validation.data;

    // Check user authentication
    let userId: string | null = null;
    let fallbackCategoryIds: string[] | undefined = undefined;

    try {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!authError && user) {
        userId = user.id;
      }
    } catch {
      // In non-auth or testing contexts, proceed to preview fallback
    }

    // In preview / unauthenticated mode, supply default interest categories
    if (!userId) {
      fallbackCategoryIds = ["technology-ai", "cat-tech", "technology"];
    }

    const result = await getUserPersonalizedFeed({
      userId,
      userCategoryIds: fallbackCategoryIds,
      limit,
      offset,
    });

    return NextResponse.json(
      {
        success: true,
        feed: result.stories,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          count: result.count,
        },
        meta: {
          mode: result.mode,
          userCategoryCount: result.userCategoryCount,
          isPersonalized: true,
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
