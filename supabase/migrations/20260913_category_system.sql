-- =====================================================================
-- Personal Intelligence - Step 1C: Category System Migration
-- =====================================================================

-- 1. Create categories table
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  parent_id uuid references public.categories(id) on delete cascade,
  level integer not null check (level in (1, 2, 3)),
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for parent/children hierarchical lookups and sorting
create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists categories_level_sort_idx on public.categories(level, sort_order);
create index if not exists categories_slug_idx on public.categories(slug);

-- 2. Create user_category_preferences table
create table if not exists public.user_category_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, category_id)
);

create index if not exists user_category_preferences_user_id_idx on public.user_category_preferences(user_id);
create index if not exists user_category_preferences_category_id_idx on public.user_category_preferences(category_id);

-- 3. Database Trigger: Enforce maximum 5 category selections per user
create or replace function public.check_user_category_limit()
returns trigger
language plpgsql
as $$
declare
  pref_count integer;
begin
  select count(*) into pref_count
  from public.user_category_preferences
  where user_id = new.user_id;

  if pref_count >= 5 then
    raise exception 'User cannot select more than 5 categories/topics';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_user_category_limit on public.user_category_preferences;
create trigger enforce_user_category_limit
before insert on public.user_category_preferences
for each row
execute function public.check_user_category_limit();

-- 4. Enable Row Level Security (RLS)
alter table public.categories enable row level security;
alter table public.user_category_preferences enable row level security;

-- Categories RLS: Viewable by everyone (both authenticated and anon)
drop policy if exists "Categories are viewable by everyone" on public.categories;
create policy "Categories are viewable by everyone"
  on public.categories
  for select
  to anon, authenticated
  using (is_active = true);

-- User Category Preferences RLS: Strict per-user isolation
drop policy if exists "Users can view own category preferences" on public.user_category_preferences;
create policy "Users can view own category preferences"
  on public.user_category_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own category preferences" on public.user_category_preferences;
create policy "Users can insert own category preferences"
  on public.user_category_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own category preferences" on public.user_category_preferences;
create policy "Users can delete own category preferences"
  on public.user_category_preferences
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- 5. Seed Taxonomy: 15 Main Categories, Subcategories, and Topics
do $$
declare
  -- Level 1 variables
  c_tech uuid;
  c_biz uuid;
  c_fin uuid;
  c_sci uuid;
  c_health uuid;
  c_pol uuid;
  c_world uuid;
  c_env uuid;
  c_edu uuid;
  c_jobs uuid;
  c_sports uuid;
  c_ent uuid;
  c_life uuid;
  c_travel uuid;
  c_food uuid;

  -- Level 2 variables
  sub_ai uuid;
  sub_software uuid;
  sub_hardware uuid;
  sub_cyber uuid;
  sub_macro uuid;
  sub_stocks uuid;
  sub_crypto uuid;
  sub_space uuid;
  sub_med uuid;
  sub_gov uuid;
  sub_geo uuid;
  sub_climate uuid;
  sub_hire uuid;
  sub_games uuid;
  sub_culinary uuid;
begin

  -- ================= 1. Technology =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Technology', 'technology', 'Artificial Intelligence, software engineering, hardware, and emerging tech.', 1, 'Cpu', 1)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_tech;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Artificial Intelligence', 'technology-ai', 'Machine learning, generative models, and agent architectures.', c_tech, 2, 'Bot', 1)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_ai;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('AI Models', 'ai-models', 'Frontier LLMs, multimodal architectures, and reasoning models.', sub_ai, 3, 1),
    ('Generative AI', 'generative-ai', 'Diffusion, synthetic media, voice models, and video generation.', sub_ai, 3, 2),
    ('AI Agents', 'ai-agents', 'Autonomous coding agents, agentic workflows, and tool orchestration.', sub_ai, 3, 3),
    ('AI Infrastructure', 'ai-infrastructure', 'GPU clusters, training supercomputers, inference scaling, and ML compilers.', sub_ai, 3, 4),
    ('AI Applications', 'ai-applications', 'Enterprise AI, healthcare AI, and consumer intelligent assistants.', sub_ai, 3, 5)
  on conflict (slug) do nothing;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Software', 'technology-software', 'Developer platforms, cloud infrastructure, and open-source tooling.', c_tech, 2, 'Code', 2)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_software;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('Programming', 'programming', 'Modern languages: Rust, TypeScript, Python, Go, and C++.', sub_software, 3, 1),
    ('Developer Tools', 'developer-tools', 'IDEs, compilers, CI/CD pipelines, and debugger ecosystems.', sub_software, 3, 2),
    ('Cloud Computing', 'cloud-computing', 'Serverless architectures, Kubernetes, distributed state, and AWS/GCP/Azure.', sub_software, 3, 3),
    ('Open Source', 'open-source', 'Decentralized software development, permissive licenses, and Linux kernels.', sub_software, 3, 4)
  on conflict (slug) do nothing;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Hardware', 'technology-hardware', 'Semiconductors, lithography, GPUs, and consumer electronics.', c_tech, 2, 'HardDrive', 3)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_hardware;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('Semiconductors', 'semiconductors', 'TSMC, ASML, EUV lithography, chip packaging, and fab buildouts.', sub_hardware, 3, 1),
    ('CPUs', 'cpus', 'x86, ARM architectures, RISC-V, and server silicon.', sub_hardware, 3, 2),
    ('GPUs', 'gpus', 'NVIDIA, AMD accelerators, Tensor Cores, and AI inference accelerators.', sub_hardware, 3, 3),
    ('Networking', 'networking', 'InfiniBand, 800G optical interconnects, and datacenter fabrics.', sub_hardware, 3, 4)
  on conflict (slug) do nothing;

  -- ================= 2. Business & Economy =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Business & Economy', 'business-economy', 'Macroeconomics, global commerce, corporate strategy, and venture capital.', 1, 'Briefcase', 2)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_biz;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Macroeconomics', 'business-macroeconomics', 'Central banks, interest rates, inflation, and global trade balance.', c_biz, 2, 'TrendingUp', 1)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_macro;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('Interest Rates', 'interest-rates', 'Fed, ECB, and global central bank rate decisions.', sub_macro, 3, 1),
    ('Inflation & Wages', 'inflation-wages', 'CPI prints, purchasing power, labor trends, and cost of living.', sub_macro, 3, 2),
    ('Global Trade', 'global-trade', 'Supply chains, tariffs, freight rates, and international treaties.', sub_macro, 3, 3)
  on conflict (slug) do nothing;

  -- ================= 3. Finance & Markets =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Finance & Markets', 'finance-markets', 'Equities, crypto, sovereign debt, foreign exchange, and private equity.', 1, 'DollarSign', 3)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_fin;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Stock Markets', 'finance-stock-markets', 'Public equity indexes, corporate earnings, and trading dynamics.', c_fin, 2, 'LineChart', 1)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_stocks;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('US Equities', 'us-equities', 'S&P 500, Nasdaq 100, Mega-cap tech earnings, and market breadth.', sub_stocks, 3, 1),
    ('Global Indices', 'global-indices', 'Nikkei, FTSE, DAX, and emerging market equities.', sub_stocks, 3, 2)
  on conflict (slug) do nothing;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Crypto & Digital Assets', 'finance-crypto', 'Bitcoin, Ethereum, DeFi protocols, and tokenized real-world assets.', c_fin, 2, 'Coins', 2)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_crypto;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('Bitcoin', 'bitcoin', 'Spot ETFs, halving cycles, hash rates, and institutional adoption.', sub_crypto, 3, 1),
    ('Ethereum & Layer 2s', 'ethereum-l2', 'Smart contract platforms, rollups, and zero-knowledge proofs.', sub_crypto, 3, 2)
  on conflict (slug) do nothing;

  -- ================= 4. Science =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Science', 'science', 'Space exploration, quantum physics, biotechnology, and astronomical discoveries.', 1, 'Atom', 4)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_sci;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Space & Astronomy', 'science-space', 'Planetary probes, space telescopes, astrophysics, and orbital rockets.', c_sci, 2, 'Rocket', 1)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_space;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('Spaceflight', 'spaceflight', 'Starship, Artemis Moon missions, and commercial orbital logistics.', sub_space, 3, 1),
    ('Cosmology', 'cosmology', 'James Webb findings, dark matter searches, and exoplanet atmospheres.', sub_space, 3, 2)
  on conflict (slug) do nothing;

  -- ================= 5. Health =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Health', 'health', 'Medicine, neuroscience, preventative care, longevity, and clinical trials.', 1, 'HeartPulse', 5)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_health;

  insert into public.categories (name, slug, description, parent_id, level, icon, sort_order)
  values ('Medicine & Clinical', 'health-medicine', 'Novel therapeutics, clinical trial breakthroughs, and oncology research.', c_health, 2, 'Stethoscope', 1)
  on conflict (slug) do update set parent_id = excluded.parent_id
  returning id into sub_med;

  insert into public.categories (name, slug, description, parent_id, level, sort_order) values
    ('Oncology', 'oncology', 'Immunotherapy, CAR-T, cancer vaccines, and early detection diagnostics.', sub_med, 3, 1),
    ('Longevity', 'longevity', 'Cellular rejuvenation, senolytics, and metabolic health.', sub_med, 3, 2)
  on conflict (slug) do nothing;

  -- ================= 6. Politics & Government =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Politics & Government', 'politics-government', 'Legislative policy, national elections, governance, and Supreme Court rulings.', 1, 'Landmark', 6)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_pol;

  -- ================= 7. World =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('World', 'world', 'International diplomacy, geopolitics, regional developments, and foreign policy.', 1, 'Globe', 7)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_world;

  -- ================= 8. Environment & Climate =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Environment & Climate', 'environment-climate', 'Clean energy, grid decarbonization, ecological conservation, and meteorology.', 1, 'Leaf', 8)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_env;

  -- ================= 9. Education =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Education', 'education', 'Pedagogy, university research, EdTech, and lifelong learning.', 1, 'GraduationCap', 9)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_edu;

  -- ================= 10. Jobs & Careers =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Jobs & Careers', 'jobs-careers', 'Workplace transformation, remote work, salary trends, and recruitment.', 1, 'Users', 10)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_jobs;

  -- ================= 11. Sports =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Sports', 'sports', 'Global athletics, championship leagues, team stats, and tournament analysis.', 1, 'Trophy', 11)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_sports;

  -- ================= 12. Entertainment & Culture =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Entertainment & Culture', 'entertainment-culture', 'Cinema, streaming media, gaming, literature, and contemporary art.', 1, 'Film', 12)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_ent;

  -- ================= 13. Lifestyle =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Lifestyle', 'lifestyle', 'Personal productivity, modern architecture, wellness routines, and urban living.', 1, 'Smile', 13)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_life;

  -- ================= 14. Travel =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Travel', 'travel', 'Global destinations, aviation updates, hospitality trends, and travel guides.', 1, 'Compass', 14)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_travel;

  -- ================= 15. Food =================
  insert into public.categories (name, slug, description, level, icon, sort_order)
  values ('Food', 'food', 'Culinary arts, food science, restaurant culture, and agricultural innovation.', 1, 'Utensils', 15)
  on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  returning id into c_food;

end $$;
