import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeUrl,
  normalizeTitle,
  computeTitleSimilarity,
  classifyDuplicateCandidate,
  deduplicateIntraBatch,
  type CandidateArticleComparison,
} from "../../../src/server/news/deduplication";
import type { NormalizedArticle } from "../../../src/server/news/types";

test("Step 2G: Article Deduplication & Canonicalization Suite", async (t) => {
  // --------------------------------------------------------------------------
  // Test A: Exact provider + external_id duplicate
  // --------------------------------------------------------------------------
  await t.test("Test A — Exact provider/external_id duplicate", () => {
    const article1: CandidateArticleComparison = {
      provider: "rss",
      externalId: "bbc-news-12345",
      canonicalUrl: "https://www.bbc.com/news/12345",
      title: "Global Tech Summit Opens in Tokyo",
      sourceName: "BBC News",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    const article2: CandidateArticleComparison = {
      provider: "rss",
      externalId: "bbc-news-12345",
      canonicalUrl: "https://www.bbc.com/news/12345",
      title: "Global Tech Summit Opens in Tokyo",
      sourceName: "BBC News",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    const classification = classifyDuplicateCandidate(article1, article2);
    assert.equal(classification.type, "EXACT_EXTERNAL_ID");
    assert.equal(classification.isExactDuplicate, true);
    assert.equal(classification.score, 1.0);
  });

  // --------------------------------------------------------------------------
  // Test B: Same URL
  // --------------------------------------------------------------------------
  await t.test("Test B — Same URL canonicalization", () => {
    const url1 = "https://example.com/articles/ai-revolution";
    const url2 = "https://example.com/articles/ai-revolution";

    assert.equal(canonicalizeUrl(url1), canonicalizeUrl(url2));

    const article1: CandidateArticleComparison = {
      provider: "rss",
      externalId: "ext-1",
      canonicalUrl: canonicalizeUrl(url1),
      title: "AI Revolution",
      sourceName: "Example Source",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    const article2: CandidateArticleComparison = {
      provider: "gdelt",
      externalId: "ext-2",
      canonicalUrl: canonicalizeUrl(url2),
      title: "AI Revolution",
      sourceName: "Another Source",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    const classification = classifyDuplicateCandidate(article1, article2);
    assert.equal(classification.type, "EXACT_CANONICAL_URL");
    assert.equal(classification.isExactDuplicate, true);
    assert.equal(classification.score, 1.0);
  });

  // --------------------------------------------------------------------------
  // Test C: Same URL with UTM tracking parameters
  // --------------------------------------------------------------------------
  await t.test("Test C — Same URL with UTM tracking parameters", () => {
    const cleanUrl = "https://example.com/news/story?id=123";
    const trackedUrl1 = "https://example.com/news/story?id=123&utm_source=rss&utm_medium=feed&utm_campaign=daily";
    const trackedUrl2 = "https://example.com/news/story?utm_campaign=daily&id=123&fbclid=IwAR234xyz&at_medium=RSS";

    const canonicalClean = canonicalizeUrl(cleanUrl);
    const canonicalTracked1 = canonicalizeUrl(trackedUrl1);
    const canonicalTracked2 = canonicalizeUrl(trackedUrl2);

    assert.equal(canonicalTracked1, canonicalClean);
    assert.equal(canonicalTracked2, canonicalClean);
    assert.equal(canonicalClean, "https://example.com/news/story?id=123");
  });

  // --------------------------------------------------------------------------
  // Test D: Different meaningful query parameters
  // --------------------------------------------------------------------------
  await t.test("Test D — Preserves different meaningful query parameters", () => {
    const urlA = "https://example.com/news/story?id=123&article=ai";
    const urlB = "https://example.com/news/story?id=456&article=ai";

    const canonicalA = canonicalizeUrl(urlA);
    const canonicalB = canonicalizeUrl(urlB);

    assert.notEqual(canonicalA, canonicalB);
    assert.equal(canonicalA, "https://example.com/news/story?article=ai&id=123");
    assert.equal(canonicalB, "https://example.com/news/story?article=ai&id=456");
  });

  // --------------------------------------------------------------------------
  // Test E: Title case differences
  // --------------------------------------------------------------------------
  await t.test("Test E — Title case differences normalize to identical string", () => {
    const titleUpper = "Apple Launches New AI Model";
    const titleLower = "apple launches new ai model";
    const titleMixed = "ApPlE lAuNcHeS nEw Ai MoDeL";

    assert.equal(normalizeTitle(titleUpper), "apple launches new ai model");
    assert.equal(normalizeTitle(titleLower), "apple launches new ai model");
    assert.equal(normalizeTitle(titleMixed), "apple launches new ai model");
    assert.equal(normalizeTitle(titleUpper), normalizeTitle(titleLower));
  });

  // --------------------------------------------------------------------------
  // Test F: Whitespace differences
  // --------------------------------------------------------------------------
  await t.test("Test F — Repeated and irregular whitespace collapses to single space", () => {
    const rawWhitespace = "   Apple   Launches\t\tNew \n\n AI   Model  ";
    const cleanTitle = "Apple Launches New AI Model";

    assert.equal(normalizeTitle(rawWhitespace), normalizeTitle(cleanTitle));
    assert.equal(normalizeTitle(rawWhitespace), "apple launches new ai model");
  });

  // --------------------------------------------------------------------------
  // Test G: Unicode and punctuation normalization
  // --------------------------------------------------------------------------
  await t.test("Test G — Unicode quotes, dashes, and trailing punctuation normalized", () => {
    const punctuatedTitle = "“Apple” — Launches New AI Model!";
    const standardTitle = "Apple - Launches New AI Model";

    const normPunct = normalizeTitle(punctuatedTitle);
    const normStd = normalizeTitle(standardTitle);

    assert.equal(normPunct, "apple - launches new ai model");
    assert.equal(normStd, "apple - launches new ai model");
    assert.equal(normPunct, normStd);
  });

  // --------------------------------------------------------------------------
  // Test H: Different articles with similar words
  // --------------------------------------------------------------------------
  await t.test("Test H — Genuinely different articles with similar words are marked DISTINCT", () => {
    const titleA = "Apple launches new flagship smartphone in Cupertino";
    const titleB = "Google launches new Android flagship in Mountain View";

    const similarity = computeTitleSimilarity(titleA, titleB);
    assert.ok(similarity < 0.65, `Similarity should be low for distinct products: ${similarity}`);

    const article1: CandidateArticleComparison = {
      provider: "rss",
      externalId: "ext-apple",
      canonicalUrl: "https://example.com/apple",
      title: titleA,
      sourceName: "TechNews",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    const article2: CandidateArticleComparison = {
      provider: "rss",
      externalId: "ext-google",
      canonicalUrl: "https://example.com/google",
      title: titleB,
      sourceName: "TechNews",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    const classification = classifyDuplicateCandidate(article1, article2);
    assert.equal(classification.type, "DISTINCT");
    assert.equal(classification.isExactDuplicate, false);
  });

  // --------------------------------------------------------------------------
  // Test I: Same event from different sources
  // --------------------------------------------------------------------------
  await t.test("Test I — Same event from different sources identified as candidate, NOT destructively merged", () => {
    const titleA = "Company X launches new AI model";
    const titleB = "Company X launches its latest artificial intelligence model";

    const similarity = computeTitleSimilarity(titleA, titleB);
    assert.ok(
      similarity >= 0.70,
      `Cross-source headline similarity should be high (>= 0.70): got ${similarity}`
    );

    const article1: CandidateArticleComparison = {
      provider: "rss",
      externalId: "source-a-100",
      canonicalUrl: "https://source-a.com/articles/company-x-ai",
      title: titleA,
      sourceName: "Source A",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    const article2: CandidateArticleComparison = {
      provider: "gdelt",
      externalId: "source-b-200",
      canonicalUrl: "https://source-b.com/articles/company-x-latest-ai",
      title: titleB,
      sourceName: "Source B",
      publishedAt: new Date("2026-09-13T12:00:00Z"), // 2 hours later
    };

    const classification = classifyDuplicateCandidate(article1, article2, { candidateThreshold: 0.70 });
    assert.equal(classification.type, "CANDIDATE_SIMILAR");
    // Crucial rule: isExactDuplicate MUST BE false so both articles are preserved in the database
    assert.equal(classification.isExactDuplicate, false);
    assert.ok(classification.score >= 0.70);
  });

  // --------------------------------------------------------------------------
  // Test J: Old article vs new unrelated article
  // --------------------------------------------------------------------------
  await t.test("Test J — Old article vs new article separated by time window is DISTINCT", () => {
    const title = "Quarterly Financial Results and Revenue Growth";

    const oldArticle: CandidateArticleComparison = {
      provider: "rss",
      externalId: "ext-q1",
      canonicalUrl: "https://example.com/financials-q1",
      title: title,
      sourceName: "Financial Times",
      publishedAt: new Date("2025-01-15T10:00:00Z"), // 1.5 years ago
    };

    const newArticle: CandidateArticleComparison = {
      provider: "rss",
      externalId: "ext-q3",
      canonicalUrl: "https://example.com/financials-q3",
      title: title,
      sourceName: "Financial Times",
      publishedAt: new Date("2026-09-13T10:00:00Z"),
    };

    // Even with identical title and source, time separation > 72 hours prevents false duplicate merge
    const classification = classifyDuplicateCandidate(newArticle, oldArticle, { maxTimeWindowHours: 72 });
    assert.equal(classification.type, "DISTINCT");
    assert.equal(classification.isExactDuplicate, false);
  });

  // --------------------------------------------------------------------------
  // Test K: Intra-batch deduplication
  // --------------------------------------------------------------------------
  await t.test("Test K — Intra-batch deduplication catches tracking parameter variations in same batch", () => {
    const batch: NormalizedArticle[] = [
      {
        externalId: "article-clean",
        title: "Frontier AI Systems Breakthrough",
        description: "Summary",
        content: null,
        url: "https://example.com/story/frontier-ai",
        imageUrl: null,
        author: null,
        publishedAt: new Date("2026-09-13T10:00:00Z"),
        language: "en",
        source: { externalId: "example.com", name: "Example", url: "https://example.com" },
      },
      {
        // Same canonical URL with UTM parameters
        externalId: "article-tracked",
        title: "Frontier AI Systems Breakthrough",
        description: "Summary",
        content: null,
        url: "https://example.com/story/frontier-ai?utm_source=twitter&utm_medium=social",
        imageUrl: null,
        author: null,
        publishedAt: new Date("2026-09-13T10:00:00Z"),
        language: "en",
        source: { externalId: "example.com", name: "Example", url: "https://example.com" },
      },
      {
        // Genuinely distinct article
        externalId: "article-distinct",
        title: "Quantum Computing Benchmark Released",
        description: "Summary",
        content: null,
        url: "https://example.com/story/quantum-benchmark",
        imageUrl: null,
        author: null,
        publishedAt: new Date("2026-09-13T10:30:00Z"),
        language: "en",
        source: { externalId: "example.com", name: "Example", url: "https://example.com" },
      },
    ];

    const result = deduplicateIntraBatch(batch, "rss");
    assert.equal(result.uniqueArticles.length, 2);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.uniqueArticles[0].canonicalUrl, "https://example.com/story/frontier-ai");
    assert.equal(result.uniqueArticles[1].canonicalUrl, "https://example.com/story/quantum-benchmark");
  });
});
