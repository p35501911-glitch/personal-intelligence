import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { newDb } from "pg-mem";

interface TestSourceRow {
  id: string;
  provider: string;
  external_id: string;
  name: string;
  url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TestArticleRow {
  id: string;
  source_id: string | null;
  provider: string;
  external_id: string;
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  image_url: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  language: string | null;
  raw_data: unknown;
  created_at: string;
  updated_at: string;
}

function createTestDatabase() {
  const db = newDb();

  // Register gen_random_uuid() for uuid generation
  db.public.registerFunction({
    name: "gen_random_uuid",
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  // Create tables & indexes matching supabase/migrations/20260913_article_database.sql
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
      normalized_title text,
      description text,
      content text,
      url text not null,
      canonical_url text,
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

    create index articles_published_at_idx on public.articles(published_at desc);
    create index articles_source_id_idx on public.articles(source_id);
    create index articles_provider_idx on public.articles(provider);
    create index articles_fetched_at_idx on public.articles(fetched_at desc);
    create index articles_canonical_url_idx on public.articles(canonical_url);
    create index articles_normalized_title_idx on public.articles(normalized_title);
  `);

  return db;
}

test("Test 1 — Source insertion: A valid source can be inserted", () => {
  const db = createTestDatabase();

  const source = db.public.one(`
    insert into public.sources (provider, external_id, name, url)
    values ('gdelt', 'techcrunch.com', 'TechCrunch', 'https://techcrunch.com')
    returning *;
  `) as unknown as TestSourceRow;

  assert.ok(source.id, "Source should have a generated UUID");
  assert.equal(source.provider, "gdelt");
  assert.equal(source.external_id, "techcrunch.com");
  assert.equal(source.name, "TechCrunch");
  assert.equal(source.url, "https://techcrunch.com");
  assert.equal(source.is_active, true);
  assert.ok(source.created_at);
  assert.ok(source.updated_at);
});

test("Test 2 — Article insertion: A valid article can be inserted and associated with a source", () => {
  const db = createTestDatabase();

  const source = db.public.one(`
    insert into public.sources (provider, external_id, name, url)
    values ('gdelt', 'bbc.com', 'BBC News', 'https://bbc.com')
    returning id;
  `) as unknown as { id: string };

  const article = db.public.one(`
    insert into public.articles (
      source_id,
      provider,
      external_id,
      title,
      description,
      content,
      url,
      image_url,
      author,
      published_at,
      language,
      raw_data
    )
    values (
      '${source.id}',
      'gdelt',
      'https://bbc.com/news/technology-12345',
      'Quantum Computing Milestone Achieved',
      'Researchers demonstrate 10,000 qubit coherence.',
      'Full article text here...',
      'https://bbc.com/news/technology-12345',
      'https://bbc.com/images/quantum.jpg',
      'Jane Doe',
      '2026-09-13T08:00:00Z',
      'English',
      '{"seendate": "20260913T080000Z"}'::jsonb
    )
    returning *;
  `) as unknown as TestArticleRow;

  assert.ok(article.id);
  assert.equal(article.source_id, source.id);
  assert.equal(article.provider, "gdelt");
  assert.equal(article.external_id, "https://bbc.com/news/technology-12345");
  assert.equal(article.title, "Quantum Computing Milestone Achieved");
  assert.equal(article.url, "https://bbc.com/news/technology-12345");
  assert.equal(article.language, "English");
  assert.ok(article.published_at);
  assert.ok(article.fetched_at);
});

test("Test 3 — Duplicate source protection: Trying to insert the same (provider, external_id) must fail", () => {
  const db = createTestDatabase();

  db.public.none(`
    insert into public.sources (provider, external_id, name)
    values ('gdelt', 'reuters.com', 'Reuters');
  `);

  assert.throws(
    () => {
      db.public.none(`
        insert into public.sources (provider, external_id, name)
        values ('gdelt', 'reuters.com', 'Reuters Duplicate');
      `);
    },
    /unique/i,
    "Expected unique constraint violation on (provider, external_id)"
  );
});

test("Test 4 — Duplicate article protection: Trying to insert the same (provider, external_id) must fail", () => {
  const db = createTestDatabase();

  db.public.none(`
    insert into public.articles (provider, external_id, title, url, published_at)
    values ('gdelt', 'article-abc-123', 'First Ingestion', 'https://example.com/1', now());
  `);

  assert.throws(
    () => {
      db.public.none(`
        insert into public.articles (provider, external_id, title, url, published_at)
        values ('gdelt', 'article-abc-123', 'Second Ingestion Attempt', 'https://example.com/1', now());
      `);
    },
    /unique/i,
    "Expected unique constraint violation on (provider, external_id)"
  );
});

test("Test 5 — Null source: An article must be allowed to exist with source_id = null", () => {
  const db = createTestDatabase();

  const article = db.public.one(`
    insert into public.articles (source_id, provider, external_id, title, url, published_at)
    values (null, 'gdelt', 'orphan-article-001', 'Independent Article', 'https://example.com/orphan', now())
    returning *;
  `) as unknown as TestArticleRow;

  assert.ok(article.id);
  assert.equal(article.source_id, null);
  assert.equal(article.title, "Independent Article");
});

test("Test 6 — Foreign key: An article with a valid source_id correctly references its source", () => {
  const db = createTestDatabase();

  const source = db.public.one(`
    insert into public.sources (provider, external_id, name, url)
    values ('gdelt', 'theverge.com', 'The Verge', 'https://theverge.com')
    returning id, name;
  `) as unknown as { id: string; name: string };

  const article = db.public.one(`
    insert into public.articles (source_id, provider, external_id, title, url, published_at)
    values ('${source.id}', 'gdelt', 'verge-ai-agent-01', 'AI Agents Review', 'https://theverge.com/ai', now())
    returning id, title;
  `) as unknown as { id: string; title: string };

  const joined = db.public.one(`
    select a.title, s.name as source_name
    from public.articles a
    join public.sources s on a.source_id = s.id
    where a.id = '${article.id}';
  `) as unknown as { title: string; source_name: string };

  assert.equal(joined.title, "AI Agents Review");
  assert.equal(joined.source_name, "The Verge");
});

test("Test 7 — Source deletion: Deleting a source sets the related article's source_id to NULL rather than deleting the article", () => {
  const db = createTestDatabase();

  const source = db.public.one(`
    insert into public.sources (provider, external_id, name)
    values ('gdelt', 'wired.com', 'Wired')
    returning id;
  `) as unknown as { id: string };

  const article = db.public.one(`
    insert into public.articles (source_id, provider, external_id, title, url, published_at)
    values ('${source.id}', 'gdelt', 'wired-001', 'Cybersecurity Future', 'https://wired.com/sec', now())
    returning id, source_id;
  `) as unknown as { id: string; source_id: string | null };

  assert.equal(article.source_id, source.id);

  // Delete source record
  db.public.none(`delete from public.sources where id = '${source.id}';`);

  // Verify article still exists, with source_id set to null
  const articleAfter = db.public.one(`
    select id, source_id, title from public.articles where id = '${article.id}';
  `) as unknown as { id: string; source_id: string | null; title: string };

  assert.ok(articleAfter, "Article must not be deleted when source is removed");
  assert.equal(articleAfter.source_id, null, "source_id should be set to null");
  assert.equal(articleAfter.title, "Cybersecurity Future");
});

test("Test 8 — RLS: Verify that migration enables RLS and prevents unauthenticated client writes", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260913_article_database.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");

  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  // Verify RLS enabled for sources & articles
  assert.ok(
    /alter\s+table\s+public\.sources\s+enable\s+row\s+level\s+security/i.test(
      migrationSql
    ),
    "RLS must be enabled on sources table"
  );
  assert.ok(
    /alter\s+table\s+public\.articles\s+enable\s+row\s+level\s+security/i.test(
      migrationSql
    ),
    "RLS must be enabled on articles table"
  );

  // Verify no public/anon insert, update, or delete policies are created
  assert.ok(
    !/create\s+policy.*for\s+(insert|update|delete).*to\s+(anon|authenticated|public)/i.test(
      migrationSql
    ),
    "No insert/update/delete policies should be granted to anon or authenticated users"
  );

  // Verify foreign key on delete set null
  assert.ok(
    /references\s+public\.sources\(id\)\s+on\s+delete\s+set\s+null/i.test(
      migrationSql
    ),
    "Foreign key must be configured with ON DELETE SET NULL"
  );

  // Verify composite unique constraints
  assert.ok(
    /unique\(provider,\s*external_id\)/i.test(migrationSql),
    "Both tables must enforce unique(provider, external_id)"
  );
});
