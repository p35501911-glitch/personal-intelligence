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

    create table public.stories (
      id uuid primary key default gen_random_uuid(),
      canonical_title text not null,
      summary text,
      first_published_at timestamptz not null,
      latest_published_at timestamptz not null,
      article_count integer not null default 1,
      source_count integer not null default 1,
      importance_score numeric,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.story_articles (
      story_id uuid not null references public.stories(id) on delete cascade,
      article_id uuid not null references public.articles(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (story_id, article_id)
    );

    create index stories_first_published_at_idx on public.stories(first_published_at desc);
    create index stories_latest_published_at_idx on public.stories(latest_published_at desc);
    create index stories_status_idx on public.stories(status);
    create index story_articles_story_id_idx on public.story_articles(story_id);
    create index story_articles_article_id_idx on public.story_articles(article_id);

    create table public.categories (
      id uuid primary key default gen_random_uuid(),
      slug text unique not null,
      name text not null,
      description text,
      parent_id uuid references public.categories(id) on delete cascade,
      level integer not null default 1,
      display_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index categories_slug_idx on public.categories(slug);
    create index categories_parent_id_idx on public.categories(parent_id);

    create table public.article_categories (
      article_id uuid not null references public.articles(id) on delete cascade,
      category_id uuid not null references public.categories(id) on delete cascade,
      confidence numeric not null default 1.0,
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      primary key (article_id, category_id)
    );

    create index article_categories_article_id_idx on public.article_categories(article_id);
    create index article_categories_category_id_idx on public.article_categories(category_id);
    create index article_categories_is_primary_idx on public.article_categories(is_primary);

    create table public.story_categories (
      story_id uuid not null references public.stories(id) on delete cascade,
      category_id uuid not null references public.categories(id) on delete cascade,
      confidence numeric not null default 1.0,
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      primary key (story_id, category_id)
    );

    create index story_categories_story_id_idx on public.story_categories(story_id);
    create index story_categories_category_id_idx on public.story_categories(category_id);
    create index story_categories_is_primary_idx on public.story_categories(is_primary);
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

test("Test 9 — Story & Junction insertion: Stories and story_articles can be created and linked", () => {
  const db = createTestDatabase();

  const article = db.public.one(`
    insert into public.articles (provider, external_id, title, url, published_at)
    values ('rss', 'art-001', 'Major Tech Breakthrough', 'https://example.com/tech1', '2026-09-13T10:00:00Z')
    returning id, title;
  `) as unknown as { id: string; title: string };

  const story = db.public.one(`
    insert into public.stories (
      canonical_title,
      first_published_at,
      latest_published_at,
      article_count,
      source_count
    )
    values (
      '${article.title}',
      '2026-09-13T10:00:00Z',
      '2026-09-13T10:00:00Z',
      1,
      1
    )
    returning *;
  `) as unknown as { id: string; canonical_title: string; article_count: number };

  assert.ok(story.id);
  assert.equal(story.canonical_title, article.title);
  assert.equal(story.article_count, 1);

  const link = db.public.one(`
    insert into public.story_articles (story_id, article_id)
    values ('${story.id}', '${article.id}')
    returning *;
  `) as unknown as { story_id: string; article_id: string };

  assert.equal(link.story_id, story.id);
  assert.equal(link.article_id, article.id);

  // Duplicate link attempt must fail due to composite primary key
  assert.throws(
    () => {
      db.public.none(`
        insert into public.story_articles (story_id, article_id)
        values ('${story.id}', '${article.id}');
      `);
    },
    /unique|primary/i,
    "Expected primary key violation on duplicate (story_id, article_id)"
  );
});

test("Test 10 — Story deletion does not delete attached articles", () => {
  const db = createTestDatabase();

  const article = db.public.one(`
    insert into public.articles (provider, external_id, title, url, published_at)
    values ('rss', 'art-preserve-01', 'Article To Preserve', 'https://example.com/preserve', now())
    returning id;
  `) as unknown as { id: string };

  const story = db.public.one(`
    insert into public.stories (canonical_title, first_published_at, latest_published_at)
    values ('Article To Preserve', now(), now())
    returning id;
  `) as unknown as { id: string };

  db.public.none(`
    insert into public.story_articles (story_id, article_id)
    values ('${story.id}', '${article.id}');
  `);

  // Delete the story
  db.public.none(`delete from public.stories where id = '${story.id}';`);

  // Verify article still exists
  const articleAfter = db.public.one(`
    select id, title from public.articles where id = '${article.id}';
  `) as unknown as { id: string; title: string };
  assert.ok(articleAfter, "Article must remain intact when story is deleted");

  // Verify junction row was cascade deleted
  const linkAfter = db.public.many(`
    select * from public.story_articles where story_id = '${story.id}';
  `);
  assert.equal(linkAfter.length, 0, "Junction rows must be cascade deleted when story is deleted");
});

test("Test 11 — Article deletion removes relationship safely without deleting story", () => {
  const db = createTestDatabase();

  const article1 = db.public.one(`
    insert into public.articles (provider, external_id, title, url, published_at)
    values ('rss', 'art-del-01', 'Article To Delete', 'https://example.com/del1', now())
    returning id;
  `) as unknown as { id: string };

  const article2 = db.public.one(`
    insert into public.articles (provider, external_id, title, url, published_at)
    values ('rss', 'art-keep-02', 'Article To Keep', 'https://example.com/keep2', now())
    returning id;
  `) as unknown as { id: string };

  const story = db.public.one(`
    insert into public.stories (canonical_title, first_published_at, latest_published_at, article_count)
    values ('Shared Story', now(), now(), 2)
    returning id;
  `) as unknown as { id: string };

  db.public.none(`
    insert into public.story_articles (story_id, article_id)
    values ('${story.id}', '${article1.id}'), ('${story.id}', '${article2.id}');
  `);

  // Delete article1
  db.public.none(`delete from public.articles where id = '${article1.id}';`);

  // Story must still exist
  const storyAfter = db.public.one(`
    select id, canonical_title from public.stories where id = '${story.id}';
  `) as unknown as { id: string };
  assert.ok(storyAfter, "Story must remain intact when one article is deleted");

  // Article2 must still exist
  const article2After = db.public.one(`
    select id from public.articles where id = '${article2.id}';
  `) as unknown as { id: string };
  assert.ok(article2After, "Other article must remain intact");

  // Junction row for article1 deleted, article2 still linked
  const remainingLinks = db.public.many(`
    select article_id from public.story_articles where story_id = '${story.id}';
  `) as unknown as { article_id: string }[];
  assert.equal(remainingLinks.length, 1);
  assert.equal(remainingLinks[0].article_id, article2.id);
});

test("Test 12 — Category hierarchy insertion: Root and child categories link correctly", () => {
  const db = createTestDatabase();

  const rootCat = db.public.one(`
    insert into public.categories (slug, name, level, display_order)
    values ('technology', 'Technology', 1, 1)
    returning *;
  `) as unknown as { id: string; slug: string; name: string; level: number; parent_id: string | null };

  assert.ok(rootCat.id, "Root category should have UUID");
  assert.equal(rootCat.slug, "technology");
  assert.equal(rootCat.level, 1);
  assert.equal(rootCat.parent_id, null);

  const subCat = db.public.one(`
    insert into public.categories (slug, name, level, parent_id, display_order)
    values ('technology-ai', 'Artificial Intelligence', 2, '${rootCat.id}', 1)
    returning *;
  `) as unknown as { id: string; slug: string; parent_id: string };

  assert.ok(subCat.id, "Child category should have UUID");
  assert.equal(subCat.parent_id, rootCat.id, "Child should reference root parent");
});

test("Test 13 — Article categories junction: Cascade deletion cleans up associations", () => {
  const db = createTestDatabase();

  const cat = db.public.one(`
    insert into public.categories (slug, name, level)
    values ('technology', 'Technology', 1)
    returning id;
  `) as unknown as { id: string };

  const article = db.public.one(`
    insert into public.articles (provider, external_id, title, url, published_at)
    values ('rss', 'art-cat-01', 'AI Breakthrough Announced', 'https://example.com/ai', now())
    returning id;
  `) as unknown as { id: string };

  db.public.none(`
    insert into public.article_categories (article_id, category_id, confidence, is_primary)
    values ('${article.id}', '${cat.id}', 0.95, true);
  `);

  const link = db.public.one(`
    select * from public.article_categories where article_id = '${article.id}';
  `) as unknown as { article_id: string; category_id: string; confidence: string; is_primary: boolean };

  assert.ok(link);
  assert.equal(link.article_id, article.id);
  assert.equal(link.category_id, cat.id);
  assert.equal(link.is_primary, true);

  // Delete article -> junction row must cascade delete
  db.public.none(`delete from public.articles where id = '${article.id}';`);

  const linkAfter = db.public.many(`
    select * from public.article_categories where article_id = '${article.id}';
  `);
  assert.equal(linkAfter.length, 0, "Junction record should cascade delete with article");
});

test("Test 14 — Story categories junction: Cascade deletion cleans up associations", () => {
  const db = createTestDatabase();

  const cat = db.public.one(`
    insert into public.categories (slug, name, level)
    values ('markets', 'Markets', 1)
    returning id;
  `) as unknown as { id: string };

  const story = db.public.one(`
    insert into public.stories (canonical_title, first_published_at, latest_published_at)
    values ('Stock Markets Surge Today', now(), now())
    returning id;
  `) as unknown as { id: string };

  db.public.none(`
    insert into public.story_categories (story_id, category_id, confidence, is_primary)
    values ('${story.id}', '${cat.id}', 0.88, true);
  `);

  const link = db.public.one(`
    select * from public.story_categories where story_id = '${story.id}';
  `) as unknown as { story_id: string; category_id: string; is_primary: boolean };

  assert.ok(link);
  assert.equal(link.is_primary, true);

  // Delete story -> junction row must cascade delete
  db.public.none(`delete from public.stories where id = '${story.id}';`);

  const linkAfter = db.public.many(`
    select * from public.story_categories where story_id = '${story.id}';
  `);
  assert.equal(linkAfter.length, 0, "Junction record should cascade delete with story");
});

