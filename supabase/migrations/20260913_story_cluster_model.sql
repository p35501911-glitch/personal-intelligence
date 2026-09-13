-- =====================================================================
-- Personal Intelligence - Step 2H: Story Cluster Model
-- =====================================================================

-- 1. Create stories table
create table if not exists public.stories (
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

-- 2. Create story_articles junction table
create table if not exists public.story_articles (
  story_id uuid not null references public.stories(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, article_id)
);

-- 3. Create Performance Indexes
create index if not exists stories_first_published_at_idx
on public.stories(first_published_at desc);

create index if not exists stories_latest_published_at_idx
on public.stories(latest_published_at desc);

create index if not exists stories_status_idx
on public.stories(status);

create index if not exists story_articles_story_id_idx
on public.story_articles(story_id);

create index if not exists story_articles_article_id_idx
on public.story_articles(article_id);

-- 4. Trigger for automatic updated_at on stories
drop trigger if exists set_stories_updated_at on public.stories;
create trigger set_stories_updated_at
before update on public.stories
for each row
execute function public.handle_updated_at();

-- 5. Enable Row Level Security (RLS)
alter table public.stories enable row level security;
alter table public.story_articles enable row level security;

-- 6. Expose tables to Data API and Service Role
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.stories to postgres, service_role;
grant all on table public.story_articles to postgres, service_role;
grant select on table public.stories to anon, authenticated;
grant select on table public.story_articles to anon, authenticated;

-- 7. Backfill existing articles into initial story records (if not already linked)
do $$
declare
  art record;
  new_story_id uuid;
begin
  for art in
    select a.id, a.title, a.published_at, a.source_id
    from public.articles a
    where not exists (
      select 1 from public.story_articles sa where sa.article_id = a.id
    )
    order by a.published_at asc
  loop
    insert into public.stories (
      canonical_title,
      first_published_at,
      latest_published_at,
      article_count,
      source_count,
      status,
      created_at,
      updated_at
    ) values (
      art.title,
      art.published_at,
      art.published_at,
      1,
      1,
      'active',
      art.published_at,
      art.published_at
    ) returning id into new_story_id;

    insert into public.story_articles (story_id, article_id, created_at)
    values (new_story_id, art.id, art.published_at)
    on conflict do nothing;
  end loop;
end;
$$;

-- 8. Force PostgREST schema cache reload
notify pgrst, 'reload schema';
