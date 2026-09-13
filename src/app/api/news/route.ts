import { NextResponse } from "next/server";
import { z } from "zod";
import { getPersistedArticles } from "@/server/news/reader";

// Zod schema for query parameter validation
export const newsQuerySchema = z.object({
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
  categoryId: z
    .string()
    .trim()
    .min(1, "CategoryId cannot be empty")
    .optional(),
  provider: z
    .string()
    .trim()
    .toLowerCase()
    .refine((val) => ["rss", "gdelt"].includes(val), {
      message: "Provider must be either 'rss' or 'gdelt'",
    })
    .optional(),
});

export type NewsQueryInput = z.infer<typeof newsQuerySchema>;

/**
 * GET /api/news
 *
 * Reads persisted normalized articles from Supabase PostgreSQL.
 * Does NOT invoke external providers on user requests.
 *
 * Query Parameters:
 * - limit: number (1-50, default 20)
 * - offset: number (>= 0, default 0)
 * - categoryId: string (optional category filter)
 * - provider: 'rss' | 'gdelt' (optional provider filter)
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
    const categoryIdParam = searchParams.get("categoryId");
    if (categoryIdParam !== null && categoryIdParam.trim() !== "") {
      rawParams.categoryId = categoryIdParam.trim();
    }
    const providerParam = searchParams.get("provider");
    if (providerParam !== null && providerParam.trim() !== "") {
      rawParams.provider = providerParam.trim();
    }

    // Validate parameters with Zod
    const validation = newsQuerySchema.safeParse(rawParams);
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

    const { limit, offset, provider, categoryId } = validation.data;

    // Fetch persisted articles from database
    const result = await getPersistedArticles({
      limit,
      offset,
      provider,
      categoryId,
    });

    return NextResponse.json(
      {
        success: true,
        articles: result.articles,
        pagination: {
          limit: result.limit,
          count: result.count,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[News Read API] Error:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch articles from database",
      },
      { status: 500 }
    );
  }
}
