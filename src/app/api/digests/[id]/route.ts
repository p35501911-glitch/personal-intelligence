import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDigestById } from "@/server/news/digests";

/**
 * GET /api/digests/[id]
 *
 * Retrieves a single executive intelligence briefing by ID for the authenticated user,
 * including its full ranked story list and intelligence synthesis.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Digest ID is required" },
        { status: 400 }
      );
    }

    const digest = await getDigestById(id.trim(), user.id, supabase);

    if (!digest) {
      return NextResponse.json(
        { success: false, error: "Digest not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      digest,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Digest Detail API] Error fetching briefing:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to fetch briefing" },
      { status: 500 }
    );
  }
}
