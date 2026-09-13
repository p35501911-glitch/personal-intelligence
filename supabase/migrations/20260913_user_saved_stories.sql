-- =====================================================================
-- Personal Intelligence - Phase 3C: User Saved Stories & Bookmarks
-- =====================================================================

-- 1. Create user_saved_stories table
create table if not exists public.user_saved_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_saved_stories_user_story_unique unique (user_id, story_id)
);

-- 2. Performance Indexes
create index if not exists user_saved_stories_user_created_idx
  on public.user_saved_stories(user_id, created_at desc);

create index if not exists user_saved_stories_user_story_idx
  on public.user_saved_stories(user_id, story_id);

create index if not exists user_saved_stories_story_id_idx
  on public.user_saved_stories(story_id);

-- 3. Enable Row Level Security (RLS)
alter table public.user_saved_stories enable row level security;

-- 4. Strict User-Isolated RLS Policies
-- SELECT: Authenticated users can view only their own bookmarks
drop policy if exists "Users can view own saved stories" on public.user_saved_stories;
create policy "Users can view own saved stories"
  on public.user_saved_stories
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- INSERT: Authenticated users can only insert rows for their own user_id
drop policy if exists "Users can insert own saved stories" on public.user_saved_stories;
create policy "Users can insert own saved stories"
  on public.user_saved_stories
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- DELETE: Authenticated users can only delete their own bookmarks
drop policy if exists "Users can delete own saved stories" on public.user_saved_stories;
create policy "Users can delete own saved stories"
  on public.user_saved_stories
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- 5. Expose table to Data API and Service Role
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.user_saved_stories to postgres, service_role;
grant select, insert, delete on table public.user_saved_stories to authenticated;
