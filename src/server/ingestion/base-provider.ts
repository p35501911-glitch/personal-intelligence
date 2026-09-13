import { NewsProvider, FetchOptions, SearchOptions, FetchResult } from './types';
import { NormalizedArticle, normalizedArticleSchema } from '@/types/article';

export abstract class BaseNewsProvider implements NewsProvider {
  abstract readonly name: string;
  abstract readonly slug: string;
  abstract readonly isConfigured: boolean;

  abstract fetchLatest(options?: FetchOptions): Promise<FetchResult>;
  abstract search(options: SearchOptions): Promise<FetchResult>;
  abstract normalize(rawItem: unknown): NormalizedArticle;

  /**
   * Validate and sanitize a normalized article using the strict Zod schema.
   * Throws ZodError if article fails validation.
   */
  protected validateArticle(article: NormalizedArticle): NormalizedArticle {
    return normalizedArticleSchema.parse(article);
  }

  /**
   * Safe article validation that returns null instead of throwing on invalid items.
   * Useful when parsing bulk feeds where individual items may have broken fields.
   */
  protected safeValidateArticle(article: unknown): NormalizedArticle | null {
    const result = normalizedArticleSchema.safeParse(article);
    if (!result.success) {
      console.warn(`[${this.name}] Dropped invalid article:`, result.error.issues.map((i) => i.message).join(', '));
      return null;
    }
    return result.data;
  }

  /**
   * Helper to parse and standardize timestamps into valid Date objects.
   */
  protected parseDate(rawDate: unknown, fallback: Date = new Date()): Date {
    if (!rawDate) return fallback;
    const parsed = new Date(String(rawDate));
    return isNaN(parsed.getTime()) ? fallback : parsed;
  }
}
