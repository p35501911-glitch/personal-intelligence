import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unsaveStory } from "@/server/news/saved-stories";
import {
  checkRateLimit,
  getClientIdentifier,
  RATE_LIMIT_CONFIGS,
  rateLimitExceededResponse,
} from "@/server/security/rate-limiter";

/**
 * DELETE /api/saved-stories/[storyId]
 *
 * Removes a story from the authenticated user's saved intelligence dossier.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ storyId: string }> }
) {
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
      `saved:delete:${clientId}`,
      RATE_LIMIT_CONFIGS.mutations
    );
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    const { storyId } = await params;
    if (!storyId || typeof storyId !== "string" || storyId.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "storyId is required" },
        { status: 400 }
      );
    }

    const result = await unsaveStory(user.id, storyId.trim(), supabase);

    return NextResponse.json(
      {
        success: true,
        storyId: result.storyId,
        removed: true,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Saved Stories API] Error removing saved story:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to remove saved story" },
      { status: 500 }
    );
  }
}
