import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import {
  RssNewsProvider,
  createRssNewsProvider,
  normalizeRssItem,
  extractExternalId,
  extractRssImageUrl,
  type CustomRssItem,
} from "../../../src/server/news/providers/rss";
import { isSafeFeedUrl } from "../../../src/server/news/security";
import { persistArticles } from "../../../src/server/news/persistence";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/types/database";

const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Tech Dispatch</title>
  <link>https://techdispatch.example.com</link>
  <description>Latest tech stories</description>
  <language>en-US</language>
  <item>
    <title>Quantum Computing Breakthrough</title>
    <link>https://techdispatch.example.com/2026/09/quantum-breakthrough</link>
    <guid isPermaLink="false">guid-qb-12345</guid>
    <pubDate>Sun, 13 Sep 2026 09:30:00 GMT</pubDate>
    <description>Researchers achieve scalable qubits.</description>
    <content:encoded><![CDATA[<p>Full article content regarding quantum computing...</p>]]></content:encoded>
    <dc:creator>Dr. Jane Doe</dc:creator>
    <media:content url="https://techdispatch.example.com/images/quantum.jpg" medium="image" />
  </item>
</channel>
</rss>`;

const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Science Daily Atom</title>
  <link href="https://sciencedaily.example.com"/>
  <updated>2026-09-13T09:00:00Z</updated>
  <id>urn:uuid:sciencedaily-feed</id>
  <entry>
    <title>New Exoplanet Discovered</title>
    <link href="https://sciencedaily.example.com/articles/exoplanet-7b"/>
    <id>tag:sciencedaily.example.com,2026:article-987</id>
    <updated>2026-09-13T08:45:00Z</updated>
    <summary>Astronomers find habitable zone planet.</summary>
    <content type="html"><![CDATA[<p>Detailed analysis of exoplanet 7b...</p>]]></content>
    <author>
      <name>Prof. Alex Rivera</name>
    </author>
  </entry>
</feed>`;

function createMockSupabase(): SupabaseClient<Database> {
  const db = newDb();
  db.public.registerFunction({
    name: "gen_random_uuid",
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  db.public.none(`
    create table public.sources (
      id text primary key default gen_random_uuid(),
      provider text not null,
      external_id text not null,
      name text not null,
      url text,
      is_active boolean not null default true,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      constraint sources_provider_external_id_key unique (provider, external_id)
    );

    create table public.articles (
      id text primary key default gen_random_uuid(),
      source_id text references public.sources(id) on delete set null,
      provider text not null,
      external_id text not null,
      title text not null,
      description text,
      content text,
      url text not null,
      image_url text,
      author text,
      published_at timestamp with time zone not null,
      fetched_at timestamp with time zone not null default now(),
      language text,
      raw_data jsonb,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      constraint articles_provider_external_id_key unique (provider, external_id)
    );
  `);

  return {
    from: (tableName: string) => {
      let selectedFields = "*";
      const eqFilters: Array<{ col: string; val: unknown }> = [];
      const inFilters: Array<{ col: string; vals: unknown[] }> = [];

      const builder: Record<string, unknown> = {
        select: (fields?: string) => {
          if (fields) selectedFields = fields;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          eqFilters.push({ col, val });
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          inFilters.push({ col, vals });
          return builder;
        },
        upsert: (
          records: Array<Record<string, unknown>>,
          options?: { onConflict?: string; ignoreDuplicates?: boolean }
        ) => {
          const upsertReturnBuilder: Record<string, unknown> = {
            select: () => executeUpsert(records, options),
          };
          (upsertReturnBuilder as unknown as { then: unknown }).then = (
            onfulfilled?: (val: unknown) => unknown,
            onrejected?: (err: unknown) => unknown
          ) => {
            return executeUpsert(records, options).then(onfulfilled, onrejected);
          };
          return upsertReturnBuilder;
        },
      };

      async function executeUpsert(
        records: Array<Record<string, unknown>>,
        options?: { onConflict?: string; ignoreDuplicates?: boolean }
      ) {
        const returnedRows: Array<Record<string, unknown>> = [];
        for (const record of records) {
          const provider = String(record.provider || "");
          const externalId = String(record.external_id || "");

          const existing = db.public.many(
            `select id from public.${tableName} where provider = '${provider}' and external_id = '${externalId.replace(/'/g, "''")}'`
          );

          if (existing.length === 0) {
            if (tableName === "sources") {
              const inserted = db.public.one(
                `insert into public.sources (provider, external_id, name, url, is_active)
                 values ('${provider}', '${externalId.replace(/'/g, "''")}', '${String(record.name || "").replace(/'/g, "''")}', ${record.url ? `'${String(record.url).replace(/'/g, "''")}'` : "null"}, true)
                 returning *`
              );
              returnedRows.push(inserted as Record<string, unknown>);
            } else if (tableName === "articles") {
              const inserted = db.public.one(
                `insert into public.articles (source_id, provider, external_id, title, description, content, url, image_url, author, published_at, fetched_at, language)
                 values (${record.source_id ? `'${record.source_id}'` : "null"}, '${provider}', '${externalId.replace(/'/g, "''")}', '${String(record.title || "").replace(/'/g, "''")}', ${record.description ? `'${String(record.description).replace(/'/g, "''")}'` : "null"}, ${record.content ? `'${String(record.content).replace(/'/g, "''")}'` : "null"}, '${String(record.url || "").replace(/'/g, "''")}', ${record.image_url ? `'${String(record.image_url).replace(/'/g, "''")}'` : "null"}, ${record.author ? `'${String(record.author).replace(/'/g, "''")}'` : "null"}, '${record.published_at}', '${record.fetched_at}', ${record.language ? `'${record.language}'` : "null"})
                 returning *`
              );
              returnedRows.push(inserted as Record<string, unknown>);
            }
          } else {
            if (!options?.ignoreDuplicates && tableName === "sources") {
              db.public.none(
                `update public.sources set name = '${String(record.name || "").replace(/'/g, "''")}', updated_at = now() where id = '${(existing[0] as { id: string }).id}'`
              );
            }
            returnedRows.push(existing[0] as Record<string, unknown>);
          }
        }
        return { data: returnedRows, error: null };
      }

      (builder as unknown as { then: unknown }).then = (
        onfulfilled?: (val: unknown) => unknown
      ) => {
        try {
          let sql = `select ${selectedFields} from public.${tableName}`;
          const clauses: string[] = [];
          for (const f of eqFilters) {
            clauses.push(`${f.col} = '${String(f.val).replace(/'/g, "''")}'`);
          }
          for (const f of inFilters) {
            if (f.vals.length === 0) {
              clauses.push("1=0");
            } else {
              const inList = f.vals.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(", ");
              clauses.push(`${f.col} in (${inList})`);
            }
          }
          if (clauses.length > 0) {
            sql += ` where ${clauses.join(" and ")}`;
          }
          const rows = db.public.many(sql);
          if (onfulfilled) onfulfilled({ data: rows, error: null });
        } catch (error) {
          if (onfulfilled) onfulfilled({ data: null, error });
        }
      };

      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("Test 1 — Valid RSS item normalizes correctly", async () => {
  const provider = new RssNewsProvider({ feeds: [] });
  const articles = await provider.parseFeedString(SAMPLE_RSS_XML, {
    url: "https://techdispatch.example.com/feed.xml",
    name: "Tech Dispatch",
  });

  assert.equal(articles.length, 1);
  const article = articles[0];
  assert.equal(article.title, "Quantum Computing Breakthrough");
  assert.equal(article.url, "https://techdispatch.example.com/2026/09/quantum-breakthrough");
  assert.equal(article.externalId, "guid-qb-12345");
  assert.equal(article.description, "Researchers achieve scalable qubits.");
  assert.ok(article.content?.includes("Full article content"));
  assert.equal(article.author, "Dr. Jane Doe");
  assert.equal(article.imageUrl, "https://techdispatch.example.com/images/quantum.jpg");
  assert.equal(article.language, "en-US");
  assert.equal(article.source.externalId, "https://techdispatch.example.com/feed.xml");
  assert.equal(article.source.name, "Tech Dispatch");
});

test("Test 2 — Valid Atom item normalizes correctly", async () => {
  const provider = new RssNewsProvider({ feeds: [] });
  const articles = await provider.parseFeedString(SAMPLE_ATOM_XML, {
    url: "https://sciencedaily.example.com/atom.xml",
    name: "Science Daily",
  });

  assert.equal(articles.length, 1);
  const article = articles[0];
  assert.equal(article.title, "New Exoplanet Discovered");
  assert.equal(article.url, "https://sciencedaily.example.com/articles/exoplanet-7b");
  assert.equal(article.externalId, "tag:sciencedaily.example.com,2026:article-987");
  assert.equal(article.description, "Astronomers find habitable zone planet.");
  assert.ok(article.content?.includes("Detailed analysis of exoplanet 7b"));
  assert.equal(article.author, "Prof. Alex Rivera");
  assert.equal(article.imageUrl, null);
  assert.equal(article.source.externalId, "https://sciencedaily.example.com/atom.xml");
});

test("Test 3 — Missing optional fields become null", () => {
  const item: CustomRssItem = {
    title: "Minimal Article",
    link: "https://example.com/minimal",
  };
  const normalized = normalizeRssItem(item, {
    url: "https://example.com/feed.xml",
    name: "Example Feed",
  });

  assert.ok(normalized);
  assert.equal(normalized.title, "Minimal Article");
  assert.equal(normalized.url, "https://example.com/minimal");
  assert.equal(normalized.externalId, "https://example.com/minimal");
  assert.equal(normalized.description, null);
  assert.equal(normalized.content, null);
  assert.equal(normalized.imageUrl, null);
  assert.equal(normalized.author, null);
  assert.equal(normalized.language, null);
  assert.ok(normalized.publishedAt instanceof Date);
});

test("Test 4 — GUID becomes externalId", () => {
  const item1: CustomRssItem = {
    guid: "unique-guid-999",
    link: "https://example.com/art-1",
  };
  assert.equal(extractExternalId(item1, "https://example.com/art-1"), "unique-guid-999");

  // Object GUID with _
  const item2: CustomRssItem = {
    guid: { _: "object-guid-888" },
    link: "https://example.com/art-2",
  };
  assert.equal(extractExternalId(item2, "https://example.com/art-2"), "object-guid-888");
});

test("Test 5 — Missing GUID falls back deterministically to article URL", () => {
  const item: CustomRssItem = {
    link: "https://example.com/news/123",
  };
  const externalId = extractExternalId(item, "https://example.com/news/123");
  assert.equal(externalId, "https://example.com/news/123");
});

test("Test 6 — Same item fetched twice produces the same external ID", () => {
  const itemWithGuid: CustomRssItem = {
    guid: "stable-id-1",
    link: "https://example.com/news/article-one",
  };
  const id1 = extractExternalId(itemWithGuid, itemWithGuid.link!);
  const id2 = extractExternalId(itemWithGuid, itemWithGuid.link!);
  assert.equal(id1, id2);

  const itemWithoutGuid: CustomRssItem = {
    link: "https://example.com/news/article-two",
  };
  const id3 = extractExternalId(itemWithoutGuid, itemWithoutGuid.link!);
  const id4 = extractExternalId(itemWithoutGuid, itemWithoutGuid.link!);
  assert.equal(id3, id4);
  assert.equal(id3, "https://example.com/news/article-two");
});

test("Test 7 — Image extraction works for supported RSS image formats", () => {
  // media:content object
  const item1: CustomRssItem = {
    mediaContent: { $: { url: "https://img.example.com/mc1.jpg" } },
  };
  assert.equal(extractRssImageUrl(item1), "https://img.example.com/mc1.jpg");

  // media:thumbnail array
  const item2: CustomRssItem = {
    mediaThumbnail: [{ $: { url: "https://img.example.com/thumb.png" } }],
  };
  assert.equal(extractRssImageUrl(item2), "https://img.example.com/thumb.png");

  // enclosure with image MIME
  const item3: CustomRssItem = {
    enclosure: { url: "https://img.example.com/enc.webp", type: "image/webp" },
  };
  assert.equal(extractRssImageUrl(item3), "https://img.example.com/enc.webp");

  // enclosure with image extension
  const item4: CustomRssItem = {
    enclosure: { url: "https://img.example.com/photo.jpeg" },
  };
  assert.equal(extractRssImageUrl(item4), "https://img.example.com/photo.jpeg");

  // inline img tag fallback
  const item5: CustomRssItem = {
    description: '<p>Some text with <img src="https://img.example.com/inline.jpg" alt="test" /></p>',
  };
  assert.equal(extractRssImageUrl(item5), "https://img.example.com/inline.jpg");

  // none available
  const item6: CustomRssItem = { description: "Just text" };
  assert.equal(extractRssImageUrl(item6), null);
});

test("Test 8 — Malformed XML is handled safely without throwing", async () => {
  const provider = createRssNewsProvider({
    feeds: [
      {
        id: "bad-xml",
        name: "Broken Feed",
        url: "https://example.com/bad.xml",
      },
    ],
  });

  // Mock fetchFeedXml to return invalid XML
  provider.fetchFeedXml = async () => "<<<not xml at all???>>>";

  const result = await provider.processSingleFeed({
    id: "bad-xml",
    name: "Broken Feed",
    url: "https://example.com/bad.xml",
  });

  assert.equal(result.articles.length, 0);
  assert.ok(result.error !== null);
});

test("Test 9 — Missing title or URL is caught by validation", () => {
  const missingTitle: CustomRssItem = {
    title: "",
    link: "https://example.com/has-link",
  };
  assert.equal(
    normalizeRssItem(missingTitle, { url: "https://example.com/f", name: "F" }),
    null
  );

  const missingUrl: CustomRssItem = {
    title: "Has Title",
    link: "",
  };
  assert.equal(
    normalizeRssItem(missingUrl, { url: "https://example.com/f", name: "F" }),
    null
  );
});

test("Test 10 — One failed feed does not prevent other feeds from processing", async () => {
  const provider = createRssNewsProvider({
    feeds: [
      { id: "f1", name: "Working Feed 1", url: "https://f1.example.com/feed.xml" },
      { id: "f2", name: "Failing Feed 2", url: "https://f2.example.com/fail.xml" },
      { id: "f3", name: "Working Feed 3", url: "https://f3.example.com/feed.xml" },
    ],
  });

  // Mock fetchFeedXml
  provider.fetchFeedXml = async (url: string) => {
    if (url.includes("fail")) {
      throw new Error("HTTP 500 Internal Server Error");
    }
    return SAMPLE_RSS_XML;
  };

  const articles = await provider.fetchLatest();
  // Feed 1 and Feed 3 succeed (1 article each) = 2 articles total
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, "Quantum Computing Breakthrough");
});

test("Test 11 — Source identity remains stable across repeated fetches", async () => {
  const provider = createRssNewsProvider({ feeds: [] });

  const articlesRun1 = await provider.parseFeedString(SAMPLE_RSS_XML, {
    url: "https://techdispatch.example.com/rss.xml",
    name: "Tech Dispatch",
  });
  const articlesRun2 = await provider.parseFeedString(SAMPLE_RSS_XML, {
    url: "https://techdispatch.example.com/rss.xml",
    name: "Tech Dispatch",
  });

  assert.equal(articlesRun1[0].source.externalId, articlesRun2[0].source.externalId);
  assert.equal(articlesRun1[0].source.name, articlesRun2[0].source.name);
  assert.equal(articlesRun1[0].source.externalId, "https://techdispatch.example.com/rss.xml");
});

test("Test 12 — RSS articles successfully pass through existing persistence layer", async () => {
  const mockClient = createMockSupabase();
  const provider = createRssNewsProvider({ feeds: [] });

  const articles = await provider.parseFeedString(SAMPLE_RSS_XML, {
    url: "https://techdispatch.example.com/rss.xml",
    name: "Tech Dispatch",
  });

  // First ingestion run
  const stats1 = await persistArticles(articles, {
    provider: "rss",
    client: mockClient,
  });

  assert.equal(stats1.provider, "rss");
  assert.equal(stats1.fetched, 1);
  assert.equal(stats1.inserted, 1);
  assert.equal(stats1.skipped, 0);
  assert.equal(stats1.failed, 0);

  // Second ingestion run (idempotency test)
  const stats2 = await persistArticles(articles, {
    provider: "rss",
    client: mockClient,
  });

  assert.equal(stats2.provider, "rss");
  assert.equal(stats2.fetched, 1);
  assert.equal(stats2.inserted, 0);
  assert.equal(stats2.skipped, 1);
  assert.equal(stats2.failed, 0);
});

test("SSRF Protection — Blocks private subnets, loopbacks, and non-http protocols", () => {
  assert.equal(isSafeFeedUrl("http://localhost/rss"), false);
  assert.equal(isSafeFeedUrl("http://127.0.0.1/feed.xml"), false);
  assert.equal(isSafeFeedUrl("http://192.168.1.50/rss"), false);
  assert.equal(isSafeFeedUrl("http://10.0.0.1/feed"), false);
  assert.equal(isSafeFeedUrl("http://172.20.0.1/feed"), false);
  assert.equal(isSafeFeedUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafeFeedUrl("ftp://example.com/rss.xml"), false);
  assert.equal(isSafeFeedUrl("file:///etc/passwd"), false);

  assert.equal(isSafeFeedUrl("https://feeds.bbci.co.uk/news/rss.xml"), true);
  assert.equal(isSafeFeedUrl("https://techcrunch.com/feed/"), true);
});
