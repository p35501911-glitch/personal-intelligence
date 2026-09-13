import { NewsProvider } from './types';

export class NewsProviderRegistry {
  private providers = new Map<string, NewsProvider>();

  /**
   * Register a news provider instance.
   */
  register(provider: NewsProvider): void {
    if (this.providers.has(provider.slug)) {
      console.warn(`[NewsProviderRegistry] Overwriting provider for slug "${provider.slug}"`);
    }
    this.providers.set(provider.slug, provider);
  }

  /**
   * Retrieve a registered provider by slug.
   */
  get(slug: string): NewsProvider | undefined {
    return this.providers.get(slug);
  }

  /**
   * List all registered providers.
   */
  getAll(): NewsProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * List all configured / active providers.
   */
  getActive(): NewsProvider[] {
    return this.getAll().filter((p) => p.isConfigured);
  }
}

// Global singleton instance
export const newsProviderRegistry = new NewsProviderRegistry();
