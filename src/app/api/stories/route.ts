import { NextResponse } from "next/server";
import { z } from "zod";
import { getStories } from "@/server/news/stories";
import { getUserPersonalizedFeed } from "@/server/news/relevance";

// Zod schema for query parameter validation
export const storiesQuerySchema = z.object({
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
  status: z
    .string()
    .trim()
    .min(1, "Status cannot be empty")
    .default("active")
    .optional(),
  categoryId: z
    .string()
    .trim()
    .min(1, "Category ID cannot be empty")
    .optional(),
  personalized: z
    .coerce
    .boolean()
    .default(false)
    .optional(),
});

export type StoriesQueryInput = z.infer<typeof storiesQuerySchema>;

/**
 * GET /api/stories
 *
 * Reads persisted story clusters from Supabase PostgreSQL.
 *
 * Query Parameters:
 * - limit: number (1-50, default 20)
 * - offset: number (>= 0, default 0)
 * - status: string (default 'active', optional)
 * - categoryId: string (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract raw parameters (ignoring empty strings)
    const rawParams: Record<string, string> = {};
    const limitParam = searchParams.get("limit");
    if (limitParam !== null && limitParam.trim() !== "") {
      rawParams.limit = limitParam.trim();
    }
    const offsetParam = searchParams.get("offset");
    if (offsetParam !== null && offsetParam.trim() !== "") {
      rawParams.offset = offsetParam.trim();
    }
    const statusParam = searchParams.get("status");
    if (statusParam !== null && statusParam.trim() !== "") {
      rawParams.status = statusParam.trim();
    }
    const categoryIdParam = searchParams.get("categoryId");
    if (categoryIdParam !== null && categoryIdParam.trim() !== "") {
      rawParams.categoryId = categoryIdParam.trim();
    }
    const personalizedParam = searchParams.get("personalized");
    if (personalizedParam !== null && personalizedParam.trim() !== "") {
      rawParams.personalized = personalizedParam.trim();
    }

    // Validate parameters with Zod
    const validation = storiesQuerySchema.safeParse(rawParams);
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

    const { limit, offset, status, categoryId, personalized } = validation.data;

    // Personalized feed request
    if (personalized) {
      const feedRes = await getUserPersonalizedFeed({
        limit,
        offset,
      });

      return NextResponse.json(
        {
          success: true,
          stories: feedRes.stories,
          pagination: {
            limit: feedRes.limit,
            offset: feedRes.offset,
            count: feedRes.count,
          },
          meta: {
            personalized: true,
            mode: feedRes.mode,
          },
        },
        { status: 200 }
      );
    }

    // Fetch stories from database
    const result = await getStories({
      limit,
      offset,
      status,
      categoryId,
    });

    return NextResponse.json(
      {
        success: true,
        stories: result.stories,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          count: result.count,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Stories Read API] Error:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch stories from database",
      },
      { status: 500 }
    );
  }
}
