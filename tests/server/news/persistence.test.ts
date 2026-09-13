import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { newDb, type IMemoryDb } from "pg-mem";
import { persistArticles } from "../../../src/server/news/persistence";
import type { NormalizedArticle } from "../../../src/server/news/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/types/database";

function setupTestDatabase(): { db: IMemoryDb; mockClient: SupabaseClient<Database> } {
  const db = newDb();

  db.public.registerFunction({
    name: "gen_random_uuid",
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  db.public.none(`
    create table public.sources (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      external_id text not null,
      name text not null,
      url text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(provider, external_id)
    );

    create table public.articles (
      id uuid primary key default gen_random_uuid(),
      source_id uuid references public.sources(id) on delete set null,
      provider text not null,
      external_id text not null,
      title text not null,
      description text,
      content text,
      url text not null,
      image_url text,
      author text,
      published_at timestamptz not null,
      fetched_at timestamptz not null default now(),
      language text,
      raw_data jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(provider, external_id)
    );
  `);

  // Build a test SupabaseClient adapter over pg-mem
  const mockClient = {
    from: (tableName: string) => {
      let selectedFields = "*";
      const eqFilters: Array<{ col: string; val: unknown }> = [];
      const inFilters: Array<{ col: string; vals: unknown[] }> = [];

      const builder: Record<string, unknown> = {
        select: (fields = "*") => {
          selectedFields = fields;
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
          try {
            const upsertReturnBuilder: Record<string, unknown> = {
              select: () => {
                return executeUpsert(records, options);
              },
            };

            // Also support direct await of upsert
            (upsertReturnBuilder as unknown as { then: unknown }).then = (
              onfulfilled?: (val: unknown) => unknown,
              onrejected?: (err: unknown) => unknown
            ) => {
              return executeUpsert(records, options).then(onfulfilled, onrejected);
            };

            return upsertReturnBuilder;
          } catch (err) {
            return {
              data: null,
              error: err,
              select: () => Promise.resolve({ data: null, error: err }),
            };
          }
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
            // Already exists
            if (!options?.ignoreDuplicates) {
              if (tableName === "sources") {
                db.public.none(
                  `update public.sources set name = '${String(record.name || "").replace(/'/g, "''")}', updated_at = now() where id = '${(existing[0] as { id: string }).id}'`
                );
              }
            }
            returnedRows.push(existing[0] as Record<string, unknown>);
          }
        }

        return { data: returnedRows, error: null };
      }

      // Support await builder (queries)
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
              clauses.push(`1 = 0`);
            } else {
              const vals = f.vals
                .map((v) => `'${String(v).replace(/'/g, "''")}'`)
                .join(", ");
              clauses.push(`${f.col} in (${vals})`);
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

  return { db, mockClient };
}

// Sample helper to create normalized article
function createMockArticle(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    externalId: "https://techcrunch.com/2026/09/13/agent-frameworks",
    title: "The Rise of Autonomous AI Agents",
    description: "An in-depth look at AI architectures.",
    content: "Full article body here...",
    url: "https://techcrunch.com/2026/09/13/agent-frameworks",
    imageUrl: "https://techcrunch.com/images/hero.jpg",
    author: "Tech Reporter",
    publishedAt: new Date("2026-09-13T08:00:00Z"),
    language: "en",
    source: {
      externalId: "techcrunch.com",
      name: "TechCrunch",
      url: "https://techcrunch.com",
    },
    rawData: { sample: true },
    ...overrides,
  };
}

test("Test 1 — Source creation: New source is created when article is persisted", async () => {
  const { db, mockClient } = setupTestDatabase();
  const article = createMockArticle();

  const stats = await persistArticles([article], {
    provider: "gdelt",
    client: mockClient,
  });

  assert.equal(stats.inserted, 1);
  assert.equal(stats.failed, 0);

  const sources = db.public.many("select * from public.sources");
  assert.equal(sources.length, 1);
  assert.equal((sources[0] as { name: string }).name, "TechCrunch");
  assert.equal((sources[0] as { external_id: string }).external_id, "techcrunch.com");
  assert.equal((sources[0] as { provider: string }).provider, "gdelt");
});

test("Test 2 — Existing source reuse: Same provider/source external ID does not create a second source", async () => {
  const { db, mockClient } = setupTestDatabase();

  const a1 = createMockArticle({
    externalId: "https://techcrunch.com/art-1",
    url: "https://techcrunch.com/art-1",
  });
  const a2 = createMockArticle({
    externalId: "https://techcrunch.com/art-2",
    url: "https://techcrunch.com/art-2",
  });

  const stats = await persistArticles([a1, a2], {
    provider: "gdelt",
    client: mockClient,
  });

  assert.equal(stats.inserted, 2);

  const sources = db.public.many("select * from public.sources");
  assert.equal(sources.length, 1, "Should only have 1 source record for techcrunch.com");
});

test("Test 3 — Article insertion: Normalized article is stored correctly with mapped fields", async () => {
  const { db, mockClient } = setupTestDatabase();
  const article = createMockArticle();

  await persistArticles([article], {
    provider: "gdelt",
    client: mockClient,
  });

  const articles = db.public.many("select * from public.articles");
  assert.equal(articles.length, 1);

  const stored = articles[0] as Record<string, unknown>;
  assert.equal(stored.provider, "gdelt");
  assert.equal(stored.external_id, article.externalId);
  assert.equal(stored.title, article.title);
  assert.equal(stored.url, article.url);
  assert.ok(stored.source_id, "Article should be linked to source_id");
});

test("Test 4 — Duplicate article: Same provider + external ID does not create a duplicate", async () => {
  const { db, mockClient } = setupTestDatabase();
  const article = createMockArticle();

  // First ingestion
  const stats1 = await persistArticles([article], {
    provider: "gdelt",
    client: mockClient,
  });
  assert.equal(stats1.inserted, 1);
  assert.equal(stats1.skipped, 0);

  // Second ingestion of same article
  const stats2 = await persistArticles([article], {
    provider: "gdelt",
    client: mockClient,
  });
  assert.equal(stats2.inserted, 0);
  assert.equal(stats2.skipped, 1);

  const count = db.public.one("select count(*) as c from public.articles") as { c: number };
  assert.equal(count.c, 1, "Total article rows in database must remain 1");
});

test("Test 5 — Multiple articles: Batch persistence correctly handles multiple articles", async () => {
  const { db, mockClient } = setupTestDatabase();

  const articles = [
    createMockArticle({ externalId: "art-1", url: "https://example.com/1", source: { externalId: "src-1", name: "S1", url: null } }),
    createMockArticle({ externalId: "art-2", url: "https://example.com/2", source: { externalId: "src-2", name: "S2", url: null } }),
    createMockArticle({ externalId: "art-3", url: "https://example.com/3", source: { externalId: "src-1", name: "S1", url: null } }),
  ];

  const stats = await persistArticles(articles, {
    provider: "gdelt",
    client: mockClient,
    batchSize: 2, // test chunking
  });

  assert.equal(stats.fetched, 3);
  assert.equal(stats.inserted, 3);
  assert.equal(stats.failed, 0);

  const articleCount = db.public.one("select count(*) as c from public.articles") as { c: number };
  const sourceCount = db.public.one("select count(*) as c from public.sources") as { c: number };

  assert.equal(articleCount.c, 3);
  assert.equal(sourceCount.c, 2); // src-1 and src-2
});

test("Test 6 — Null source: An article can still be persisted if source is unavailable", async () => {
  const { db, mockClient } = setupTestDatabase();

  const orphanArticle = createMockArticle({
    externalId: "orphan-100",
    url: "https://orphan.example.com",
    source: { externalId: "", name: "", url: null },
  });

  const stats = await persistArticles([orphanArticle], {
    provider: "gdelt",
    client: mockClient,
  });

  assert.equal(stats.inserted, 1);

  const stored = db.public.one("select * from public.articles where external_id = 'orphan-100'") as { source_id: string | null };
  assert.equal(stored.source_id, null, "source_id should be null when source externalId is blank");
});

test("Test 7 — Malformed article: Invalid required data is handled safely and counted as failed", async () => {
  const { db, mockClient } = setupTestDatabase();

  const invalidArticles = [
    { ...createMockArticle(), title: "" }, // empty title
    { ...createMockArticle(), url: "" }, // empty url
    { ...createMockArticle(), externalId: "   " }, // whitespace externalId
    { ...createMockArticle(), publishedAt: new Date("invalid date") }, // invalid date
    createMockArticle({ externalId: "valid-1", url: "https://valid.example.com" }), // 1 valid
  ];

  const stats = await persistArticles(invalidArticles as NormalizedArticle[], {
    provider: "gdelt",
    client: mockClient,
  });

  assert.equal(stats.fetched, 5);
  assert.equal(stats.failed, 4);
  assert.equal(stats.inserted, 1);

  const count = db.public.one("select count(*) as c from public.articles") as { c: number };
  assert.equal(count.c, 1);
});

test("Test 8 — Idempotency: Running the same ingestion twice does not increase article rows", async () => {
  const { db, mockClient } = setupTestDatabase();

  const batch = [
    createMockArticle({ externalId: "idemp-1", url: "https://example.com/idemp-1" }),
    createMockArticle({ externalId: "idemp-2", url: "https://example.com/idemp-2" }),
  ];

  const firstRun = await persistArticles(batch, {
    provider: "gdelt",
    client: mockClient,
  });
  assert.equal(firstRun.inserted, 2);
  assert.equal(firstRun.skipped, 0);

  const secondRun = await persistArticles(batch, {
    provider: "gdelt",
    client: mockClient,
  });
  assert.equal(secondRun.inserted, 0);
  assert.equal(secondRun.skipped, 2);

  const total = db.public.one("select count(*) as c from public.articles") as { c: number };
  assert.equal(total.c, 2);
});
