import { NextResponse } from "next/server";
import { gdeltNewsProvider } from "@/server/news/providers/gdelt";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "technology";
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    const startTime = Date.now();
    const articles = await gdeltNewsProvider.fetchLatest({
      query,
      pageSize: Math.min(Math.max(limit, 1), 50),
    });
    const durationMs = Date.now() - startTime;

    console.log(`\n========================================`);
    console.log(`[GDELT Test Endpoint] Query: "${query}" | Count: ${articles.length} | Latency: ${durationMs}ms`);
    console.log(`========================================`);

    // Log the 6 required fields for each article
    articles.forEach((article, index) => {
      console.log(`\n[Article #${index + 1}]`);
      console.log(`- Title:          ${article.title}`);
      console.log(`- Description:    ${article.description ?? "(none)"}`);
      console.log(`- URL:            ${article.url}`);
      console.log(`- Image URL:      ${article.imageUrl ?? "(none)"}`);
      console.log(`- Source:         ${article.source.name} (${article.source.url ?? "no URL"})`);
      console.log(`- Published Date: ${article.publishedAt.toISOString()}`);
    });
    console.log(`========================================\n`);

    return NextResponse.json({
      success: true,
      provider: gdeltNewsProvider.name,
      query,
      count: articles.length,
      durationMs,
      articles: articles.map((a) => ({
        title: a.title,
        description: a.description,
        url: a.url,
        imageUrl: a.imageUrl,
        source: {
          name: a.source.name,
          url: a.source.url,
        },
        publishedAt: a.publishedAt.toISOString(),
        externalId: a.externalId,
        language: a.language,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[GDELT Test Endpoint] Error:", message);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
