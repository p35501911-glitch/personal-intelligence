import type {
  NewsProvider,
  NormalizedArticle,
} from "../types";

export const mockNewsProvider: NewsProvider = {
  name: "mock",

  async fetchLatest(): Promise<NormalizedArticle[]> {
    return [
      {
        externalId: "mock-001",
        title: "Example technology article",
        description: "Example article for testing.",
        content: "Example content.",
        url: "https://example.com/article",
        imageUrl: null,
        author: "Example",
        publishedAt: new Date(),
        language: "en",

        source: {
          externalId: "example",
          name: "Example Source",
          url: "https://example.com",
        },

        rawData: {},
      },
    ];
  },
};
