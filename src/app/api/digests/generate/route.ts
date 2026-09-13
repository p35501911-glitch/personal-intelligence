import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateTopicDigest } from "@/server/news/digests";

export const generateDigestBodySchema = z.object({
  periodType: z.enum(["daily", "weekly"]).default("daily"),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/digests/generate
 *
 * Generates an executive intelligence briefing for the authenticated user.
 * Strictly uses server-side authenticated session; client-supplied userId is ignored.
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

    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      // Empty body defaults to { periodType: "daily" }
      json = {};
    }

    const validation = generateDigestBodySchema.safeParse(json);
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

    const { periodType, force } = validation.data;
    const result = await generateTopicDigest({
      userId: user.id,
      periodType,
      force,
      client: supabase,
    });

    return NextResponse.json(
      {
        success: true,
        digest: result.digest,
        generated: result.generated,
        source: result.source,
      },
      { status: result.generated ? 201 : 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Digest Generate API] Error generating briefing:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
