-- =====================================================================
-- Personal Intelligence - Phase 3D: Tiered Story Intelligence (Gemini AI)
-- =====================================================================

-- 1. Create story_intelligence table (if not existing)
create table if not exists public.story_intelligence (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  model text not null default 'gemini-flash-lite-latest',
  prompt_version integer not null default 1,
  tier text not null default 'normal' check (tier in ('normal', 'important')),
  summary text not null,
  key_points jsonb not null default '[]'::jsonb,
  why_it_matters text not null default '',
  opportunities jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  status text not null default 'completed',
  error_message text,
  attempts integer not null default 1,
  last_attempt_at timestamptz not null default now(),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_intelligence_story_id_key unique (story_id)
);

-- 1b. Idempotently ensure tier column and default constraints exist if table was already created
alter table public.story_intelligence add column if not exists tier text not null default 'normal';
alter table public.story_intelligence alter column why_it_matters set default '';
alter table public.story_intelligence drop constraint if exists story_intelligence_tier_check;
alter table public.story_intelligence add constraint story_intelligence_tier_check check (tier in ('normal', 'important'));

-- 2. Performance Indexes
create index if not exists story_intelligence_story_id_idx
on public.story_intelligence(story_id);

create index if not exists story_intelligence_tier_idx
on public.story_intelligence(tier);

create index if not exists story_intelligence_status_idx
on public.story_intelligence(status);

create index if not exists story_intelligence_updated_at_idx
on public.story_intelligence(updated_at desc);

-- 3. Automatic updated_at trigger
drop trigger if exists set_story_intelligence_updated_at on public.story_intelligence;
create trigger set_story_intelligence_updated_at
before update on public.story_intelligence
for each row
execute function public.handle_updated_at();

-- 4. Enable Row Level Security (RLS)
alter table public.story_intelligence enable row level security;

-- 5. Expose table to Data API and Service Role
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.story_intelligence to postgres, service_role;
grant select on table public.story_intelligence to anon, authenticated;
