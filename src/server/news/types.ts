export type NormalizedArticle = {
  externalId: string;
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  imageUrl: string | null;
  author: string | null;
  publishedAt: Date;
  language: string | null;

  source: {
    externalId: string;
    name: string;
    url: string | null;
  };

  rawData?: unknown;
};

export type NewsFetchOptions = {
  query?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export type NewsProvider = {
  name: string;

  fetchLatest(
    options?: NewsFetchOptions
  ): Promise<NormalizedArticle[]>;
};
