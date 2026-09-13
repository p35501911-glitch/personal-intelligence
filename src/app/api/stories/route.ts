import { NextResponse } from "next/server";
import { z } from "zod";
import { getStories } from "@/server/news/stories";

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

    const { limit, offset, status } = validation.data;

    // Fetch stories from database
    const result = await getStories({
      limit,
      offset,
      status,
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
