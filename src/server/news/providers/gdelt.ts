import type { NewsFetchOptions, NewsProvider, NormalizedArticle } from "../types";

/**
 * Isolated raw article schema received from GDELT 2.0 DOC API.
 * Never exposed outside of this provider adapter.
 */
export type GdeltRawArticle = {
  url: string;
  title: string;
  seendate?: string | null;
  socialimage?: string | null;
  domain?: string | null;
  language?: string | null;
  sourcecountry?: string | null;
  url_mobile?: string | null;
  [key: string]: unknown;
};

export type GdeltApiResponse = {
  articles?: GdeltRawArticle[];
};

/**
 * Validates whether an unknown item matches the minimum required structure
 * for a GDELT article record.
 */
export function validateGdeltArticle(item: unknown): item is GdeltRawArticle {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.url === "string" &&
    candidate.url.trim().length > 0 &&
    typeof candidate.title === "string" &&
    candidate.title.trim().length > 0
  );
}

/**
 * Validates the top-level GDELT API response structure.
 */
export function validateGdeltResponse(data: unknown): GdeltApiResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Malformed GDELT response: Expected a JSON object");
  }
  const obj = data as Record<string, unknown>;
  if (obj.articles !== undefined && !Array.isArray(obj.articles)) {
    throw new Error("Malformed GDELT response: 'articles' field is not an array");
  }
  return data as GdeltApiResponse;
}

/**
 * Parses GDELT timestamp (format: YYYYMMDDTHHMMSSZ or YYYYMMDDHHMMSS)
 * into a valid JavaScript Date, with robust fallbacks.
 */
export function parseGdeltDate(seendate?: string | null): Date {
  if (!seendate || typeof seendate !== "string") {
    return new Date();
  }
  const trimmed = seendate.trim();

  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const matchIso = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/i);
  if (matchIso) {
    const [, year, month, day, hour, min, sec] = matchIso;
    const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYYMMDDHHMMSS
  const matchBasic = trimmed.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (matchBasic) {
    const [, year, month, day, hour, min, sec] = matchBasic;
    const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

/**
 * Converts a raw GDELT article record into the canonical NormalizedArticle contract.
 */
export function normalizeGdeltArticle(raw: GdeltRawArticle): NormalizedArticle {
  const rawDomain = (raw.domain || "").trim();
  const sourceName = rawDomain || "Unknown Source";
  const sourceUrl = rawDomain
    ? rawDomain.startsWith("http")
      ? rawDomain
      : `https://${rawDomain}`
    : null;

  const imageUrl =
    raw.socialimage &&
    typeof raw.socialimage === "string" &&
    raw.socialimage.trim() !== ""
      ? raw.socialimage.trim()
      : null;

  return {
    externalId: raw.url.trim(),
    title: raw.title.trim(),
    description: null,
    content: null,
    url: raw.url.trim(),
    imageUrl,
    author: null,
    publishedAt: parseGdeltDate(raw.seendate),
    language:
      raw.language && typeof raw.language === "string"
        ? raw.language.trim()
        : null,
    source: {
      externalId: rawDomain || "unknown",
      name: sourceName,
      url: sourceUrl,
    },
    rawData: raw,
  };
}

/**
 * In-process request serialization to comply with GDELT's strict 5-second per-IP rate limit.
 */
const DEFAULT_RATE_LIMIT_MS = 5100;
let lastRequestTimestamp = 0;
let throttleChain: Promise<unknown> = Promise.resolve();

export function throttleRequest<T>(action: () => Promise<T>): Promise<T> {
  const rateLimitMs =
    Number(process.env.GDELT_RATE_LIMIT_MS) || DEFAULT_RATE_LIMIT_MS;

  const scheduled = throttleChain.then(async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTimestamp;
    const waitTime = elapsed < rateLimitMs ? rateLimitMs - elapsed : 0;
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    lastRequestTimestamp = Date.now();
    return action();
  });

  throttleChain = scheduled.then(
    () => {},
    () => {}
  );
  return scheduled;
}

/**
 * Build the query URL for GDELT 2.0 DOC API.
 */
export function buildGdeltUrl(options?: NewsFetchOptions): string {
  const baseUrl =
    process.env.GDELT_API_URL || "http://api.gdeltproject.org/api/v2/doc/doc";
  const url = new URL(baseUrl);
  const query = options?.query?.trim() || "technology";
  const pageSize = Math.min(Math.max(options?.pageSize || 25, 1), 250);

  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("maxrecords", String(pageSize));
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "DateDesc");

  return url.toString();
}

/**
 * Execute HTTP fetch to GDELT with timeout, backoff retry on 429, and HTTP fallback.
 */
async function executeFetch(
  url: string,
  retryCount = 0
): Promise<NormalizedArticle[]> {
  const timeoutMs = Number(process.env.GDELT_TIMEOUT_MS) || 12000;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent":
          "PersonalIntelligence/1.0 (NewsIngestionService; +https://github.com/p35501911-glitch/personal-intelligence)",
        Accept: "application/json",
      },
    });

    if (res.status === 429) {
      if (retryCount < 2) {
        const delayMs = (retryCount + 1) * 6500;
        console.warn(
          `[GDELT Provider] Rate limited (429). Retrying after ${delayMs / 1000}s delay (attempt ${
            retryCount + 1
          }/2)...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return executeFetch(url, retryCount + 1);
      }
      console.warn(
        "[GDELT Provider] Rate limit (429) persists after retries. Returning empty list."
      );
      return [];
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(
        `[GDELT Provider] HTTP ${res.status}: ${errorText.slice(0, 200)}`
      );
      return [];
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Guard against plain text responses (e.g. rate limit warning sent with 200 OK)
    if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
      console.warn(
        `[GDELT Provider] Unexpected non-JSON response: ${text.slice(0, 150)}`
      );
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.error(
        "[GDELT Provider] JSON parse failed on response body:",
        parseErr
      );
      return [];
    }

    const validatedResponse = validateGdeltResponse(parsed);
    if (
      !validatedResponse.articles ||
      validatedResponse.articles.length === 0
    ) {
      return [];
    }

    const normalized: NormalizedArticle[] = [];
    for (const item of validatedResponse.articles) {
      if (validateGdeltArticle(item)) {
        normalized.push(normalizeGdeltArticle(item));
      } else {
        console.warn("[GDELT Provider] Skipping malformed article record:", item);
      }
    }

    return normalized;
  } catch (err: unknown) {
    const error = err as {
      name?: string;
      code?: string;
      message?: string;
      cause?: { code?: string; name?: string; message?: string };
    };

    const isTimeout =
      error?.name === "TimeoutError" ||
      error?.code === "UND_ERR_CONNECT_TIMEOUT" ||
      error?.cause?.name === "ConnectTimeoutError" ||
      error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";

    if (isTimeout || error?.message === "fetch failed") {
      if (url.startsWith("https://") && retryCount === 0) {
        const httpUrl = url.replace("https://", "http://");
        console.warn(
          `[GDELT Provider] HTTPS connection failed. Attempting fallback to HTTP: ${httpUrl}`
        );
        return executeFetch(httpUrl, 1);
      }
      if (isTimeout) {
        console.error(
          `[GDELT Provider] Request timed out after ${timeoutMs}ms.`
        );
        return [];
      }
    }

    console.error(
      "[GDELT Provider] Fetch error:",
      error?.message || String(err)
    );
    return [];
  }
}

/**
 * Production-ready GDELT News Provider implementing NewsProvider interface.
 */
export class GdeltNewsProvider implements NewsProvider {
  readonly name = "gdelt";

  async fetchLatest(
    options?: NewsFetchOptions
  ): Promise<NormalizedArticle[]> {
    const url = buildGdeltUrl(options);
    return throttleRequest(() => executeFetch(url));
  }
}

export const gdeltNewsProvider = new GdeltNewsProvider();
