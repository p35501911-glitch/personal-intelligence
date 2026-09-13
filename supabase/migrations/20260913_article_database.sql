-- =====================================================================
-- Personal Intelligence - Step 2C: Article Database (sources & articles)
-- =====================================================================

-- 1. Create sources table
create table if not exists public.sources (
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

-- 2. Create articles table
create table if not exists public.articles (
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

-- 3. Create Performance Indexes
create index if not exists articles_published_at_idx
on public.articles(published_at desc);

create index if not exists articles_source_id_idx
on public.articles(source_id);

create index if not exists articles_provider_idx
on public.articles(provider);

create index if not exists articles_fetched_at_idx
on public.articles(fetched_at desc);

-- 4. Automatic updated_at trigger
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sources_updated_at on public.sources;
create trigger set_sources_updated_at
before update on public.sources
for each row
execute function public.handle_updated_at();

drop trigger if exists set_articles_updated_at on public.articles;
create trigger set_articles_updated_at
before update on public.articles
for each row
execute function public.handle_updated_at();

-- 5. Enable Row Level Security (RLS)
alter table public.sources enable row level security;
alter table public.articles enable row level security;

-- RLS Security Rule:
-- Neither anonymous nor normal authenticated users are granted insert, update, or delete.
-- The ingestion worker writes these records server-side via service role / direct backend authority.
-- No broad public read policies are created at this stage (to be defined when feed is implemented).
