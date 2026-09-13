import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/server/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || typeof id !== "string" || id.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Valid Story ID is required" },
        { status: 400 }
      );
    }

    const storyId = id.trim();
    let supabase;
    try {
      supabase = getServiceSupabaseClient();
    } catch {
      return NextResponse.json(
        { success: false, error: "Database configuration unavailable" },
        { status: 503 }
      );
    }

    // Verify story exists
    const { data: story, error: storyErr } = await supabase
      .from("stories")
      .select("id, canonical_title")
      .eq("id", storyId)
      .maybeSingle();

    if (storyErr || !story) {
      return NextResponse.json(
        { success: false, error: "Story not found" },
        { status: 404 }
      );
    }

    // Fetch AI intelligence
    const { data: intel, error: intelErr } = await supabase
      .from("story_intelligence")
      .select("*")
      .eq("story_id", storyId)
      .maybeSingle();

    if (intelErr || !intel || intel.status !== "completed") {
      return NextResponse.json({
        success: true,
        storyId,
        hasIntelligence: false,
        status: intel?.status || "pending",
        message: "AI intelligence is pending or unavailable for this story.",
        intelligence: null,
      });
    }

    return NextResponse.json({
      success: true,
      storyId,
      hasIntelligence: true,
      status: intel.status,
      intelligence: {
        summary: intel.summary,
        keyPoints: Array.isArray(intel.key_points) ? intel.key_points : [],
        whyItMatters: intel.why_it_matters,
        opportunities: Array.isArray(intel.opportunities) ? intel.opportunities : [],
        risks: Array.isArray(intel.risks) ? intel.risks : [],
        model: intel.model,
        tier: (intel.tier as "normal" | "important") || "normal",
        promptVersion: intel.prompt_version,
        generatedAt: intel.generated_at,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
