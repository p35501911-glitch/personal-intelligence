import { NextResponse } from "next/server";
import { getStoryDetails } from "@/server/news/stories";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Story ID is required" },
        { status: 400 }
      );
    }

    const story = await getStoryDetails(id.trim());
    if (!story) {
      return NextResponse.json(
        { success: false, error: "Story not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        story,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Story Detail API] Error:", errorMsg);

    return NextResponse.json(
      { success: false, error: "Failed to fetch story details" },
      { status: 500 }
    );
  }
}
