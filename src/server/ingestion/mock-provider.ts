import { BaseNewsProvider } from './base-provider';
import { FetchOptions, SearchOptions, FetchResult } from './types';
import { NormalizedArticle } from '@/types/article';

interface RawMockArticle {
  headline: string;
  summary?: string;
  body?: string;
  article_url: string;
  cover_image?: string;
  reporter?: string;
  time_stamp?: string;
  outlet: string;
  item_id: string;
}

export class MockNewsProvider extends BaseNewsProvider {
  readonly name = 'Mock News Provider';
  readonly slug = 'mock';
  readonly isConfigured = true;

  private sampleFeed: RawMockArticle[] = [
    {
      headline: 'Next-Generation AI Agents Revolutionize Autonomous Software Development',
      summary: 'State-of-the-art coding agents orchestrate multi-step refactoring workflows with high precision.',
      body: 'Full analysis of autonomous coding agents and their impact on developer productivity.',
      article_url: 'https://example.com/news/ai-agents-software-dev',
      cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
      reporter: 'Elena Vance',
      time_stamp: new Date(Date.now() - 3600000).toISOString(),
      outlet: 'Tech Frontier',
      item_id: 'mock-art-001',
    },
    {
      headline: 'Global Central Banks Signal Stable Rates Amid Moderating Inflation',
      summary: 'Monetary policy committees emphasize balance sheet normalization while maintaining current benchmarks.',
      body: 'Review of macroeconomic indicators and interest rate expectations across major economies.',
      article_url: 'https://example.com/news/central-banks-rates',
      cover_image: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f',
      reporter: 'Marcus Sterling',
      time_stamp: new Date(Date.now() - 7200000).toISOString(),
      outlet: 'Market Observer',
      item_id: 'mock-art-002',
    },
    {
      headline: 'James Webb Space Telescope Identifies Atmospheric Compounds on Exoplanet K2-18b',
      summary: 'Spectroscopic observations confirm methane and carbon dioxide in the habitable-zone sub-Neptune atmosphere.',
      body: 'Deep astronomical spectroscopy and its implications for astrobiology research.',
      article_url: 'https://example.com/news/jwst-exoplanet-atmosphere',
      cover_image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa',
      reporter: 'Dr. Sarah Lin',
      time_stamp: new Date(Date.now() - 14400000).toISOString(),
      outlet: 'Astrophysics Daily',
      item_id: 'mock-art-003',
    },
  ];

  async fetchLatest(options?: FetchOptions): Promise<FetchResult> {
    const limit = options?.limit || 10;
    const rawItems = this.sampleFeed.slice(0, limit);
    const articles: NormalizedArticle[] = [];

    for (const raw of rawItems) {
      const normalized = this.normalize(raw);
      const validated = this.safeValidateArticle(normalized);
      if (validated) {
        articles.push(validated);
      }
    }

    return {
      articles,
      totalFetched: articles.length,
      hasMore: false,
    };
  }

  async search(options: SearchOptions): Promise<FetchResult> {
    const q = options.query.toLowerCase();
    const filtered = this.sampleFeed.filter(
      (item) =>
        item.headline.toLowerCase().includes(q) ||
        (item.summary && item.summary.toLowerCase().includes(q))
    );

    const limit = options.limit || 10;
    const articles: NormalizedArticle[] = [];

    for (const raw of filtered.slice(0, limit)) {
      const normalized = this.normalize(raw);
      const validated = this.safeValidateArticle(normalized);
      if (validated) {
        articles.push(validated);
      }
    }

    return {
      articles,
      totalFetched: articles.length,
      hasMore: false,
    };
  }

  normalize(rawItem: unknown): NormalizedArticle {
    const item = rawItem as RawMockArticle;

    return this.validateArticle({
      title: item.headline,
      description: item.summary || null,
      content: item.body || null,
      url: item.article_url,
      imageUrl: item.cover_image || null,
      author: item.reporter || null,
      publishedAt: this.parseDate(item.time_stamp),
      sourceName: item.outlet,
      sourceUrl: 'https://example.com',
      externalId: item.item_id,
      language: 'en',
      rawData: item as unknown as Record<string, unknown>,
    });
  }
}
