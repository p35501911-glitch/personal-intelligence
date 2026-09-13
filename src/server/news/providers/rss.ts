import Parser from "rss-parser";
import type { NewsFetchOptions, NewsProvider, NormalizedArticle } from "../types";
import {
  getConfiguredRssFeeds,
  type RssFeedConfig,
} from "../config/feeds";
import { assertSafeFeedUrl } from "../security";

export interface RssProviderOptions {
  feeds?: RssFeedConfig[] | string[];
  timeoutMs?: number;
  concurrency?: number;
  userAgent?: string;
}

export type CustomRssItem = {
  guid?: string | { _: string; $?: Record<string, string> };
  id?: string;
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  description?: string;
  author?: string;
  creator?: string;
  dcCreator?: string;
  mediaContent?: unknown;
  mediaThumbnail?: unknown;
  enclosure?: { url?: string; type?: string; length?: string };
  [key: string]: unknown;
};

/**
 * Parses and extracts a valid, clean image URL from diverse RSS/Atom formats:
 * - media:content
 * - media:thumbnail
 * - enclosure (image MIME types)
 * - inline <img> tag fallback from content or description
 */
export function extractRssImageUrl(item: CustomRssItem): string | null {
  // 1. Check media:content
  if (item.mediaContent) {
    const contents = Array.isArray(item.mediaContent)
      ? item.mediaContent
      : [item.mediaContent];

    for (const c of contents) {
      if (!c) continue;
      const url =
        typeof c === "object" && "$" in c && typeof (c as { $: { url?: string } }).$.url === "string"
          ? (c as { $: { url: string } }).$.url
          : typeof (c as { url?: string }).url === "string"
          ? (c as { url: string }).url
          : null;

      if (url && typeof url === "string" && url.trim().length > 0) {
        return url.trim();
      }
    }
  }

  // 2. Check media:thumbnail
  if (item.mediaThumbnail) {
    const thumbnails = Array.isArray(item.mediaThumbnail)
      ? item.mediaThumbnail
      : [item.mediaThumbnail];

    for (const t of thumbnails) {
      if (!t) continue;
      const url =
        typeof t === "object" && "$" in t && typeof (t as { $: { url?: string } }).$.url === "string"
          ? (t as { $: { url: string } }).$.url
          : typeof (t as { url?: string }).url === "string"
          ? (t as { url: string }).url
          : null;

      if (url && typeof url === "string" && url.trim().length > 0) {
        return url.trim();
      }
    }
  }

  // 3. Check enclosure
  if (item.enclosure && typeof item.enclosure.url === "string") {
    const url = item.enclosure.url.trim();
    const type = (item.enclosure.type || "").toLowerCase();
    const isImage =
      type.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|svg|avif)(\?.*)?$/i.test(url);

    if (isImage && url.length > 0) {
      return url;
    }
  }

  // 4. Fallback: extract first <img> src from content or description
  const htmlContent =
    (typeof item.content === "string" && item.content) ||
    (typeof item.description === "string" && item.description) ||
    "";

  if (htmlContent) {
    const imgMatch = htmlContent.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1].trim();
    }
  }

  return null;
}

/**
 * Extracts a deterministic external ID for an RSS item.
 * Preferred: GUID / ID.
 * Fallback: Canonical Article URL.
 */
export function extractExternalId(item: CustomRssItem, articleUrl: string): string {
  if (item.guid) {
    if (typeof item.guid === "string" && item.guid.trim().length > 0) {
      return item.guid.trim();
    }
    if (
      typeof item.guid === "object" &&
      "_" in item.guid &&
      typeof item.guid._ === "string" &&
      item.guid._.trim().length > 0
    ) {
      return item.guid._.trim();
    }
  }

  if (typeof item.id === "string" && item.id.trim().length > 0) {
    return item.id.trim();
  }

  return articleUrl;
}

/**
 * Normalizes an RSS/Atom item into the canonical NormalizedArticle format.
 */
export function normalizeRssItem(
  item: CustomRssItem,
  feedConfig: { url: string; name: string; link?: string },
  feedLanguage?: string | null
): NormalizedArticle | null {
  const url = (item.link || "").trim();
  const title = (item.title || "").trim();

  // Basic validation: must have title and url
  if (!url || !title) {
    return null;
  }

  const externalId = extractExternalId(item, url);

  // Parse published date
  let publishedAt: Date;
  if (item.isoDate) {
    publishedAt = new Date(item.isoDate);
  } else if (item.pubDate) {
    publishedAt = new Date(item.pubDate);
  } else {
    publishedAt = new Date();
  }
  if (isNaN(publishedAt.getTime())) {
    publishedAt = new Date();
  }

  // Preserve description vs content
  const description =
    item.summary?.trim() ||
    item.description?.trim() ||
    item.contentSnippet?.trim() ||
    null;

  const content =
    (typeof item.contentEncoded === "string" && item.contentEncoded.trim()) ||
    (typeof item.content === "string" && item.content.trim()) ||
    null;

  const author =
    (typeof item.creator === "string" && item.creator.trim()) ||
    (typeof item.dcCreator === "string" && item.dcCreator.trim()) ||
    (typeof item.author === "string" && item.author.trim()) ||
    null;

  const imageUrl = extractRssImageUrl(item);

  return {
    externalId,
    title,
    description,
    content,
    url,
    imageUrl,
    author,
    publishedAt,
    language: feedLanguage || null,
    source: {
      externalId: feedConfig.url,
      name: feedConfig.name,
      url: feedConfig.link || feedConfig.url,
    },
    rawData: item,
  };
}

/**
 * RSS News Provider implementation.
 * Conforms to the generic NewsProvider abstraction.
 */
export class RssNewsProvider implements NewsProvider {
  public readonly name = "rss";

  private readonly feeds: RssFeedConfig[];
  private readonly timeoutMs: number;
  private readonly concurrency: number;
  private readonly userAgent: string;
  private readonly parser: Parser<Record<string, unknown>, CustomRssItem>;

  constructor(options?: RssProviderOptions) {
    this.timeoutMs = options?.timeoutMs || 10000;
    this.concurrency = Math.max(options?.concurrency || 3, 1);
    this.userAgent =
      options?.userAgent ||
      "PersonalIntelligenceBot/1.0 (+https://github.com/p35501911-glitch/personal-intelligence)";

    // Resolve feeds
    if (options?.feeds) {
      this.feeds = options.feeds.map((f, i) => {
        if (typeof f === "string") {
          return {
            id: `feed-${i + 1}`,
            name: new URL(f).hostname,
            url: f,
            enabled: true,
          };
        }
        return f;
      });
    } else {
      this.feeds = getConfiguredRssFeeds();
    }

    this.parser = new Parser({
      customFields: {
        item: [
          ["media:content", "mediaContent", { keepArray: true }],
          ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
          ["content:encoded", "contentEncoded"],
          ["dc:creator", "dcCreator"],
        ],
      },
    });
  }

  /**
   * Fetches the raw XML for a single feed with timeout and SSRF protection.
   */
  public async fetchFeedXml(feedUrl: string): Promise<string> {
    assertSafeFeedUrl(feedUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(feedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText} fetching feed: ${feedUrl}`
        );
      }

      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parses an XML feed string into NormalizedArticle array.
   */
  public async parseFeedString(
    xmlString: string,
    feedConfig: { url: string; name?: string }
  ): Promise<NormalizedArticle[]> {
    const feed = await this.parser.parseString(xmlString);

    const sourceName = feed.title?.trim() || feedConfig.name || feedConfig.url;
    const sourceLink = (feed.link as string | undefined)?.trim() || feedConfig.url;
    const sourceConfig = {
      url: feedConfig.url,
      name: sourceName,
      link: sourceLink,
    };
    const feedLanguage = (feed as unknown as { language?: string }).language?.trim() || null;

    const normalizedArticles: NormalizedArticle[] = [];
    for (const item of feed.items || []) {
      const normalized = normalizeRssItem(item, sourceConfig, feedLanguage);
      if (normalized) {
        normalizedArticles.push(normalized);
      }
    }

    return normalizedArticles;
  }

  /**
   * Fetches a single feed and returns its normalized articles.
   * Isolates failures so a broken feed does not throw or abort others.
   */
  public async processSingleFeed(feed: RssFeedConfig): Promise<{
    feed: RssFeedConfig;
    articles: NormalizedArticle[];
    error: Error | null;
  }> {
    try {
      const xml = await this.fetchFeedXml(feed.url);
      const articles = await this.parseFeedString(xml, {
        url: feed.url,
        name: feed.name,
      });
      return { feed, articles, error: null };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[RSS Provider] Error processing feed "${feed.name}" (${feed.url}):`,
        err.message
      );
      return { feed, articles: [], error: err };
    }
  }

  /**
   * Fetches latest news across all configured feeds, honoring query filtering and limit.
   */
  public async fetchLatest(
    options?: NewsFetchOptions
  ): Promise<NormalizedArticle[]> {
    if (this.feeds.length === 0) {
      return [];
    }

    const allArticles: NormalizedArticle[] = [];

    // Bounded concurrency pool
    const queue = [...this.feeds];
    const workers = Array.from({ length: this.concurrency }, async () => {
      while (queue.length > 0) {
        const feed = queue.shift();
        if (!feed) break;
        const result = await this.processSingleFeed(feed);
        allArticles.push(...result.articles);
      }
    });

    await Promise.all(workers);

    // Sort by publication date descending
    allArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    // Optional query filtering
    let filtered = allArticles;
    if (options?.query && options.query.trim().length > 0) {
      const q = options.query.trim().toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(q) ||
          (article.description && article.description.toLowerCase().includes(q))
      );
    }

    // PageSize limit
    const pageSize = options?.pageSize ? Math.max(options.pageSize, 1) : 50;
    return filtered.slice(0, pageSize);
  }
}

/**
 * Factory function to create an RSS News Provider instance.
 */
export function createRssNewsProvider(
  options?: RssProviderOptions
): RssNewsProvider {
  return new RssNewsProvider(options);
}

/**
 * Default RSS provider instance registered globally.
 */
export const rssNewsProvider: RssNewsProvider = createRssNewsProvider();
