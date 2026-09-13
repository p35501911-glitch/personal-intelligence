import { NextResponse } from "next/server";
import { gdeltNewsProvider } from "@/server/news/providers/gdelt";
import { ingestFromProvider } from "@/server/news/ingestion";

export async function GET(request: Request) {
  // Development-only protection
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEV_TEST_ENDPOINTS) {
    return NextResponse.json(
      { error: "Development test endpoints are disabled in production." },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "technology";
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    const result = await ingestFromProvider(gdeltNewsProvider, {
      query,
      pageSize: Math.min(Math.max(limit, 1), 50),
    });

    console.log(`\n========================================`);
    console.log(
      `[GDELT Ingestion Test] Query: "${query}" | Fetched: ${result.stats.fetched} | Inserted: ${result.stats.inserted} | Updated: ${result.stats.updated} | Skipped: ${result.stats.skipped} | Failed: ${result.stats.failed}`
    );
    console.log(
      `Timings: Fetch: ${result.timings.fetchDurationMs}ms | Persist: ${result.timings.persistDurationMs}ms | Total: ${result.timings.totalDurationMs}ms`
    );
    console.log(`========================================`);

    return NextResponse.json({
      success: true,
      provider: result.provider,
      query,
      fetched: result.stats.fetched,
      inserted: result.stats.inserted,
      updated: result.stats.updated,
      skipped: result.stats.skipped,
      failed: result.stats.failed,
      timings: result.timings,
      sampleArticles: result.articles.slice(0, 5).map((a) => ({
        title: a.title,
        url: a.url,
        imageUrl: a.imageUrl,
        source: a.source.name,
        publishedAt: a.publishedAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[GDELT Ingestion Test Endpoint] Error:", message);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
