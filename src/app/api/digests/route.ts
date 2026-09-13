import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserDigests, getLatestDigest } from "@/server/news/digests";

export const getDigestsQuerySchema = z.object({
  periodType: z.enum(["daily", "weekly"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  latestOnly: z.coerce.boolean().optional().default(false),
});

/**
 * GET /api/digests
 *
 * Retrieves the authenticated user's past executive briefings or the latest one.
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
    const periodParam = searchParams.get("periodType");
    if (periodParam) rawParams.periodType = periodParam.trim().toLowerCase();
    const limitParam = searchParams.get("limit");
    if (limitParam) rawParams.limit = limitParam.trim();
    const offsetParam = searchParams.get("offset");
    if (offsetParam) rawParams.offset = offsetParam.trim();
    const latestParam = searchParams.get("latestOnly");
    if (latestParam) rawParams.latestOnly = latestParam.trim();

    const validation = getDigestsQuerySchema.safeParse(rawParams);
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

    const { periodType, limit, offset, latestOnly } = validation.data;

    if (latestOnly) {
      const latest = await getLatestDigest(user.id, periodType, supabase);
      return NextResponse.json({
        success: true,
        digest: latest,
      });
    }

    const result = await getUserDigests(user.id, { periodType, limit, offset }, supabase);

    return NextResponse.json({
      success: true,
      digests: result.digests,
      pagination: result.pagination,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Digests API] Error fetching briefings:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to fetch briefings" },
      { status: 500 }
    );
  }
}
