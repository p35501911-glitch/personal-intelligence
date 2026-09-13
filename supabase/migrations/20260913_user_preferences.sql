-- =====================================================================
-- Personal Intelligence - Step 1F: user_preferences table & RLS
-- =====================================================================

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  category_selection_mode text not null default 'CATEGORY'
    check (category_selection_mode in ('CATEGORY', 'ALL')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.user_preferences enable row level security;

-- RLS Policies
drop policy if exists "Users can view own preferences" on public.user_preferences;
create policy "Users can view own preferences"
  on public.user_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
  on public.user_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
  on public.user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
