-- =====================================================================
-- Personal Intelligence - Step 2G: Article Deduplication & Canonicalization
-- =====================================================================

-- 1. Add canonical_url and normalized_title columns to articles table
alter table public.articles
add column if not exists canonical_url text,
add column if not exists normalized_title text;

-- 2. Backfill existing rows with canonical URL (stripped tracking/query) and normalized title
update public.articles
set
  canonical_url = coalesce(canonical_url, split_part(url, '?', 1)),
  normalized_title = coalesce(normalized_title, lower(trim(regexp_replace(title, '\s+', ' ', 'g'))))
where canonical_url is null or normalized_title is null;

-- 3. Create performance indexes for deduplication lookups
create index if not exists articles_canonical_url_idx
on public.articles(canonical_url);

create index if not exists articles_normalized_title_idx
on public.articles(normalized_title);

-- 4. Expose columns to PostgREST roles (already granted via grant all/select in 20260913_article_database.sql)
grant select on table public.articles to anon, authenticated;
grant all on table public.articles to postgres, service_role;

-- 5. Force PostgREST schema cache reload
notify pgrst, 'reload schema';
