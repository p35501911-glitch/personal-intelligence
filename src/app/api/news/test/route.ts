import { NextResponse } from "next/server";
import { gdeltNewsProvider, rssNewsProvider } from "@/server/news/providers";
import { ingestFromProvider } from "@/server/news/ingestion";
import type { NewsProvider } from "@/server/news/types";

export async function GET(request: Request) {
  // Development-only protection
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.ALLOW_DEV_TEST_ENDPOINTS
  ) {
    return NextResponse.json(
      { error: "Development test endpoints are disabled in production." },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const providerParam = (searchParams.get("provider") || "gdelt").toLowerCase();
    const queryParam = searchParams.get("query");
    const query = queryParam ?? (providerParam === "gdelt" ? "technology" : undefined);
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    let provider: NewsProvider = gdeltNewsProvider;
    if (providerParam === "rss") {
      provider = rssNewsProvider;
    }

    const result = await ingestFromProvider(provider, {
      query,
      pageSize: Math.min(Math.max(limit, 1), 50),
    });

    console.log(`\n========================================`);
    console.log(
      `[${provider.name.toUpperCase()} Ingestion Test] Query: "${query}" | Fetched: ${result.stats.fetched} | Inserted: ${result.stats.inserted} | Updated: ${result.stats.updated} | Skipped: ${result.stats.skipped} | Failed: ${result.stats.failed}`
    );
    if (result.stats.errors && result.stats.errors.length > 0) {
      console.error(`[${provider.name.toUpperCase()} Ingestion Errors]:`, result.stats.errors);
    }
    console.log(
      `Timings: Fetch: ${result.timings.fetchDurationMs}ms | Persist: ${result.timings.persistDurationMs}ms | Total: ${result.timings.totalDurationMs}ms`
    );
    console.log(`========================================`);

    const hasFailures = result.stats.failed > 0 || (result.stats.errors && result.stats.errors.length > 0);

    return NextResponse.json({
      success: !hasFailures,
      provider: result.provider,
      query,
      fetched: result.stats.fetched,
      inserted: result.stats.inserted,
      updated: result.stats.updated,
      skipped: result.stats.skipped,
      failed: result.stats.failed,
      errors: result.stats.errors || [],
      timings: result.timings,
      sampleArticles: result.articles.slice(0, 5).map((a) => ({
        title: a.title,
        url: a.url,
        imageUrl: a.imageUrl,
        source: a.source.name,
        publishedAt: a.publishedAt.toISOString(),
      })),
    }, { status: hasFailures ? 502 : 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[News Ingestion Test Endpoint] Error:", message);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
