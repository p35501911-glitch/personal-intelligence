-- =====================================================================
-- Personal Intelligence - Phase 4: Production RLS Security Hardening
-- =====================================================================
-- Ensures strict Row Level Security (RLS) policies across all tables:
-- 1. Public catalog tables (categories, stories, articles, sources, intelligence):
--    - SELECT is permitted for everyone (anon and authenticated).
--    - INSERT, UPDATE, DELETE are forbidden for normal users; strictly restricted to service_role.
-- 2. User-isolated tables (preferences, saved stories, briefings):
--    - Authenticated users can ONLY access and modify their own records (auth.uid() = user_id).
--    - Unauthenticated (anon) access is completely denied.
--    - Service role maintains full backend authority for worker/ingestion/AI pipelines.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Public Catalog Tables: Ensure RLS is Enabled & SELECT Policies Exist
-- ---------------------------------------------------------------------

-- Categories
alter table if exists public.categories enable row level security;
drop policy if exists "Categories are viewable by everyone" on public.categories;
create policy "Categories are viewable by everyone"
  on public.categories for select
  to anon, authenticated
  using (is_active = true);

-- Sources
alter table if exists public.sources enable row level security;
drop policy if exists "Sources are viewable by everyone" on public.sources;
create policy "Sources are viewable by everyone"
  on public.sources for select
  to anon, authenticated
  using (true);

-- Articles
alter table if exists public.articles enable row level security;
drop policy if exists "Articles are viewable by everyone" on public.articles;
create policy "Articles are viewable by everyone"
  on public.articles for select
  to anon, authenticated
  using (true);

-- Stories
alter table if exists public.stories enable row level security;
drop policy if exists "Stories are viewable by everyone" on public.stories;
create policy "Stories are viewable by everyone"
  on public.stories for select
  to anon, authenticated
  using (true);

-- Story Articles Junction
alter table if exists public.story_articles enable row level security;
drop policy if exists "Story articles are viewable by everyone" on public.story_articles;
create policy "Story articles are viewable by everyone"
  on public.story_articles for select
  to anon, authenticated
  using (true);

-- Article Categories Junction
alter table if exists public.article_categories enable row level security;
drop policy if exists "Article categories are viewable by everyone" on public.article_categories;
create policy "Article categories are viewable by everyone"
  on public.article_categories for select
  to anon, authenticated
  using (true);

-- Story Categories Junction
alter table if exists public.story_categories enable row level security;
drop policy if exists "Story categories are viewable by everyone" on public.story_categories;
create policy "Story categories are viewable by everyone"
  on public.story_categories for select
  to anon, authenticated
  using (true);

-- Story Intelligence
alter table if exists public.story_intelligence enable row level security;
drop policy if exists "Story intelligence is viewable by everyone" on public.story_intelligence;
create policy "Story intelligence is viewable by everyone"
  on public.story_intelligence for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 2. User-Owned Tables: Strict Per-User Isolation (auth.uid() = user_id)
-- ---------------------------------------------------------------------

-- User Preferences
alter table if exists public.user_preferences enable row level security;
drop policy if exists "Users can view own preferences" on public.user_preferences;
create policy "Users can view own preferences"
  on public.user_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
  on public.user_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
  on public.user_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- User Category Preferences
alter table if exists public.user_category_preferences enable row level security;
drop policy if exists "Users can view own category preferences" on public.user_category_preferences;
create policy "Users can view own category preferences"
  on public.user_category_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own category preferences" on public.user_category_preferences;
create policy "Users can insert own category preferences"
  on public.user_category_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own category preferences" on public.user_category_preferences;
create policy "Users can delete own category preferences"
  on public.user_category_preferences for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- User Saved Stories
alter table if exists public.user_saved_stories enable row level security;
drop policy if exists "Users can view own saved stories" on public.user_saved_stories;
create policy "Users can view own saved stories"
  on public.user_saved_stories for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own saved stories" on public.user_saved_stories;
create policy "Users can insert own saved stories"
  on public.user_saved_stories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own saved stories" on public.user_saved_stories;
create policy "Users can delete own saved stories"
  on public.user_saved_stories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Topic Digests
alter table if exists public.topic_digests enable row level security;
drop policy if exists "Users can view own topic digests" on public.topic_digests;
create policy "Users can view own topic digests"
  on public.topic_digests for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own topic digests" on public.topic_digests;
create policy "Users can insert own topic digests"
  on public.topic_digests for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own topic digests" on public.topic_digests;
create policy "Users can update own topic digests"
  on public.topic_digests for update
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own topic digests" on public.topic_digests;
create policy "Users can delete own topic digests"
  on public.topic_digests for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Topic Digest Stories Junction
alter table if exists public.topic_digest_stories enable row level security;
drop policy if exists "Users can view stories of own topic digests" on public.topic_digest_stories;
create policy "Users can view stories of own topic digests"
  on public.topic_digest_stories for select
  to authenticated
  using (
    exists (
      select 1 from public.topic_digests
      where public.topic_digests.id = public.topic_digest_stories.digest_id
        and public.topic_digests.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can insert stories for own topic digests" on public.topic_digest_stories;
create policy "Users can insert stories for own topic digests"
  on public.topic_digest_stories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.topic_digests
      where public.topic_digests.id = public.topic_digest_stories.digest_id
        and public.topic_digests.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete stories for own topic digests" on public.topic_digest_stories;
create policy "Users can delete stories for own topic digests"
  on public.topic_digest_stories for delete
  to authenticated
  using (
    exists (
      select 1 from public.topic_digests
      where public.topic_digests.id = public.topic_digest_stories.digest_id
        and public.topic_digests.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 3. Grants: Expose schemas and tables to roles
-- ---------------------------------------------------------------------
grant usage on schema public to postgres, anon, authenticated, service_role;

-- Full authority for postgres and service_role
grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;
grant all on all routines in schema public to postgres, service_role;

-- Normal user table permissions (subject to RLS policies above)
grant select on table public.categories to anon, authenticated;
grant select on table public.sources to anon, authenticated;
grant select on table public.articles to anon, authenticated;
grant select on table public.stories to anon, authenticated;
grant select on table public.story_articles to anon, authenticated;
grant select on table public.article_categories to anon, authenticated;
grant select on table public.story_categories to anon, authenticated;
grant select on table public.story_intelligence to anon, authenticated;

grant select, insert, update on table public.user_preferences to authenticated;
grant select, insert, delete on table public.user_category_preferences to authenticated;
grant select, insert, delete on table public.user_saved_stories to authenticated;
grant select, insert, update, delete on table public.topic_digests to authenticated;
grant select, insert, update, delete on table public.topic_digest_stories to authenticated;

notify pgrst, 'reload schema';
