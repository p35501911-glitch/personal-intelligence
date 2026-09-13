import type { NewsProvider, NormalizedArticle } from "./types";

export async function fetchFromProvider(
  provider: NewsProvider
): Promise<NormalizedArticle[]> {
  try {
    return await provider.fetchLatest();
  } catch (error) {
    console.error(
      `News provider "${provider.name}" failed:`,
      error
    );

    return [];
  }
}
