import type { NewsFetchOptions, NewsProvider, NormalizedArticle } from "./types";

export async function fetchFromProvider(
  provider: NewsProvider,
  options?: NewsFetchOptions
): Promise<NormalizedArticle[]> {
  try {
    return await provider.fetchLatest(options);
  } catch (error) {
    console.error(
      `News provider "${provider.name}" failed:`,
      error
    );

    return [];
  }
}
