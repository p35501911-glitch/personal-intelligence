import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { saveStory, getSavedStories } from "@/server/news/saved-stories";
import {
  checkRateLimit,
  getClientIdentifier,
  RATE_LIMIT_CONFIGS,
  rateLimitExceededResponse,
} from "@/server/security/rate-limiter";

export const saveStoryBodySchema = z.object({
  storyId: z.string().trim().min(1, "storyId is required"),
});

export const getSavedStoriesQuerySchema = z.object({
  limit: z.coerce
    .number({ message: "limit must be a number" })
    .int()
    .min(1)
    .max(50)
    .default(20),
  offset: z.coerce
    .number({ message: "offset must be a number" })
    .int()
    .min(0)
    .default(0),
});

/**
 * POST /api/saved-stories
 *
 * Saves a story to the authenticated user's intelligence dossier.
 * Strictly uses authenticated session (client userId is ignored).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const clientId = getClientIdentifier(request, user.id);
    const rateCheck = checkRateLimit(
      `saved:post:${clientId}`,
      RATE_LIMIT_CONFIGS.mutations
    );
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const validation = saveStoryBodySchema.safeParse(json);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { storyId } = validation.data;
    const result = await saveStory(user.id, storyId, supabase);

    return NextResponse.json(
      {
        success: true,
        storyId: result.storyId,
        savedAt: result.createdAt,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Saved Stories API] Error saving story:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to save story" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/saved-stories
 *
 * Retrieves the authenticated user's saved stories dossier.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

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

    const validation = getSavedStoriesQuerySchema.safeParse(rawParams);
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
    const result = await getSavedStories(user.id, { limit, offset }, supabase);

    return NextResponse.json(
      {
        success: true,
        stories: result.stories,
        pagination: result.pagination,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Saved Stories API] Error fetching saved stories:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to fetch saved stories" },
      { status: 500 }
    );
  }
}
