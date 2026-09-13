import { NormalizedArticle } from '@/types/article';

export interface FetchOptions {
  since?: Date;
  limit?: number;
  category?: string;
  cursor?: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  language?: string;
  from?: Date;
  to?: Date;
}

export interface FetchResult {
  articles: NormalizedArticle[];
  totalFetched: number;
  cursor?: string;
  hasMore: boolean;
}

export interface NewsProvider {
  readonly name: string;
  readonly slug: string;
  readonly isConfigured: boolean;

  fetchLatest(options?: FetchOptions): Promise<FetchResult>;
  search(options: SearchOptions): Promise<FetchResult>;
  normalize(rawItem: unknown): NormalizedArticle;
}
