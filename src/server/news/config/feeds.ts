/**
 * Configuration definitions and loader for RSS feeds.
 * Decoupled from provider implementation to allow moving feeds into a database in future steps.
 */

export interface RssFeedConfig {
  id: string;
  name: string;
  url: string;
  category?: string;
  enabled?: boolean;
}

/**
 * Curated public feeds used by default if no external configuration is specified.
 */
export const DEFAULT_RSS_FEEDS: RssFeedConfig[] = [
  {
    id: "bbc-world",
    name: "BBC News - World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "world",
    enabled: true,
  },
  {
    id: "techcrunch",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "technology",
    enabled: true,
  },
  {
    id: "ars-technica",
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "technology",
    enabled: true,
  },
  {
    id: "the-verge",
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    category: "technology",
    enabled: true,
  },
];

/**
 * Parses and returns the list of active RSS feeds.
 * Reads from process.env.RSS_FEEDS if configured, falling back to DEFAULT_RSS_FEEDS.
 *
 * Supports:
 * 1. JSON array of feed objects or URL strings: '[{"id":"bbc","name":"BBC","url":"..."}]' or '["https://..."]'
 * 2. Comma-separated or newline-separated URLs: 'https://feed1.xml, https://feed2.xml'
 */
export function getConfiguredRssFeeds(): RssFeedConfig[] {
  const envFeeds = process.env.RSS_FEEDS?.trim();
  if (!envFeeds) {
    return DEFAULT_RSS_FEEDS.filter((f) => f.enabled !== false);
  }

  // Attempt JSON parsing
  if (envFeeds.startsWith("[") && envFeeds.endsWith("]")) {
    try {
      const parsed = JSON.parse(envFeeds);
      if (Array.isArray(parsed)) {
        const result: RssFeedConfig[] = [];
        parsed.forEach((item, index) => {
          if (typeof item === "string" && item.trim().length > 0) {
            const url = item.trim();
            result.push({
              id: `custom-feed-${index + 1}`,
              name: new URL(url).hostname,
              url,
              enabled: true,
            });
          } else if (item && typeof item === "object" && item.url) {
            result.push({
              id: String(item.id || `feed-${index + 1}`),
              name: String(item.name || item.url),
              url: String(item.url).trim(),
              category: item.category ? String(item.category) : undefined,
              enabled: item.enabled !== false,
            });
          }
        });
        if (result.length > 0) {
          return result.filter((f) => f.enabled !== false);
        }
      }
    } catch {
      console.warn("[RSS Config] Failed to parse RSS_FEEDS as JSON array. Falling back to delimited list.");
    }
  }

  // Delimited list fallback (comma or newline)
  const urls = envFeeds
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (urls.length === 0) {
    return DEFAULT_RSS_FEEDS.filter((f) => f.enabled !== false);
  }

  return urls.map((url, index) => {
    let hostname = url;
    try {
      hostname = new URL(url).hostname;
    } catch {
      // ignore
    }
    return {
      id: `custom-feed-${index + 1}`,
      name: hostname,
      url,
      enabled: true,
    };
  });
}
