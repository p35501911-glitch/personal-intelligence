-- =====================================================================
-- Personal Intelligence - Step 2I: Category Matching Engine Migration
-- =====================================================================

-- 1. Ensure categories table exists
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

create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists categories_level_sort_idx on public.categories(level, sort_order);
create index if not exists categories_slug_idx on public.categories(slug);

-- 2. Create article_categories junction table
create table if not exists public.article_categories (
  article_id uuid not null references public.articles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  confidence numeric not null default 1.0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (article_id, category_id)
);

create index if not exists article_categories_category_id_idx on public.article_categories(category_id);
create index if not exists article_categories_article_id_idx on public.article_categories(article_id);
create index if not exists article_categories_primary_idx on public.article_categories(category_id, is_primary);

-- 3. Create story_categories junction table
create table if not exists public.story_categories (
  story_id uuid not null references public.stories(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  confidence numeric not null default 1.0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (story_id, category_id)
);

create index if not exists story_categories_category_id_idx on public.story_categories(category_id);
create index if not exists story_categories_story_id_idx on public.story_categories(story_id);
create index if not exists story_categories_primary_idx on public.story_categories(category_id, is_primary);

-- 4. Enable Row Level Security (RLS)
alter table public.categories enable row level security;
alter table public.article_categories enable row level security;
alter table public.story_categories enable row level security;

-- 5. Expose tables to Data API and Service Role
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.categories to postgres, service_role;
grant all on table public.article_categories to postgres, service_role;
grant all on table public.story_categories to postgres, service_role;

grant select on table public.categories to anon, authenticated;
grant select on table public.article_categories to anon, authenticated;
grant select on table public.story_categories to anon, authenticated;

-- RLS Read Policies for Anon and Authenticated
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'Public categories select') then
    create policy "Public categories select" on public.categories for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'article_categories' and policyname = 'Public article_categories select') then
    create policy "Public article_categories select" on public.article_categories for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'story_categories' and policyname = 'Public story_categories select') then
    create policy "Public story_categories select" on public.story_categories for select to anon, authenticated using (true);
  end if;
end $$;

-- =====================================================================
-- 6. Initial Taxonomy Seed Data (All 15 Categories, Subcategories & Topics)
-- =====================================================================

-- Level 1: Root Categories
insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Technology', 'technology', 'Artificial Intelligence, software engineering, hardware, and emerging tech.', 1, 'Cpu', 1)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Business & Economy', 'business-economy', 'Macroeconomics, global commerce, corporate strategy, and venture capital.', 1, 'Briefcase', 2)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Finance & Markets', 'finance-markets', 'Equities, crypto, sovereign debt, foreign exchange, and private equity.', 1, 'DollarSign', 3)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Science', 'science', 'Space exploration, quantum physics, biotechnology, and astronomical discoveries.', 1, 'Atom', 4)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Health', 'health', 'Medicine, neuroscience, preventative care, longevity, and clinical trials.', 1, 'HeartPulse', 5)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Politics & Government', 'politics-government', 'Legislative policy, national elections, governance, and Supreme Court rulings.', 1, 'Landmark', 6)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('World', 'world', 'International diplomacy, geopolitics, regional developments, and foreign policy.', 1, 'Globe', 7)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Environment & Climate', 'environment-climate', 'Clean energy, grid decarbonization, ecological conservation, and meteorology.', 1, 'Leaf', 8)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Education', 'education', 'Pedagogy, university research, EdTech, and lifelong learning.', 1, 'GraduationCap', 9)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Jobs & Careers', 'jobs-careers', 'Workplace transformation, remote work, salary trends, and recruitment.', 1, 'Users', 10)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Sports', 'sports', 'Global athletics, championship leagues, team stats, and tournament analysis.', 1, 'Trophy', 11)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Entertainment & Culture', 'entertainment-culture', 'Cinema, streaming media, gaming, literature, and contemporary art.', 1, 'Film', 12)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Lifestyle', 'lifestyle', 'Personal productivity, modern architecture, wellness routines, and urban living.', 1, 'Smile', 13)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Travel', 'travel', 'Global destinations, aviation updates, hospitality trends, and travel guides.', 1, 'Compass', 14)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, icon, sort_order)
values ('Food', 'food', 'Culinary arts, food science, restaurant culture, and agricultural innovation.', 1, 'Utensils', 15)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order;


-- Level 2: Subcategories
insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Artificial Intelligence', 'technology-ai', 'Machine learning, generative models, and agent architectures.', 2, id, 'Bot', 1
from public.categories where slug = 'technology'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Software', 'technology-software', 'Developer platforms, cloud infrastructure, and open-source tooling.', 2, id, 'Code', 2
from public.categories where slug = 'technology'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Hardware', 'technology-hardware', 'Semiconductors, lithography, GPUs, and consumer electronics.', 2, id, 'HardDrive', 3
from public.categories where slug = 'technology'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Macroeconomics', 'business-macroeconomics', 'Central banks, interest rates, inflation, and global trade balance.', 2, id, 'TrendingUp', 1
from public.categories where slug = 'business-economy'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Venture Capital', 'business-vc', 'Seed funding, term sheets, growth equity, and IPO exits.', 2, id, 'Zap', 2
from public.categories where slug = 'business-economy'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Stock Markets', 'finance-stock-markets', 'Public equity indexes, corporate earnings, and trading dynamics.', 2, id, 'LineChart', 1
from public.categories where slug = 'finance-markets'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Crypto & Web3', 'finance-crypto', 'Bitcoin, Ethereum, DeFi protocols, and tokenized assets.', 2, id, 'Coins', 2
from public.categories where slug = 'finance-markets'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Space & Astronomy', 'science-space', 'Planetary probes, space telescopes, astrophysics, and orbital rockets.', 2, id, 'Rocket', 1
from public.categories where slug = 'science'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Medicine & Clinical', 'health-medicine', 'Novel therapeutics, clinical trials, and oncology research.', 2, id, 'Stethoscope', 1
from public.categories where slug = 'health'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Policy & Law', 'politics-policy', 'Legislation, judicial precedent, and regulation.', 2, id, 'Scale', 1
from public.categories where slug = 'politics-government'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Geopolitics', 'world-geopolitics', 'Strategic alliances, defense treaties, and foreign affairs.', 2, id, 'Shield', 1
from public.categories where slug = 'world'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Clean Energy', 'environment-energy', 'Solar, wind, next-gen nuclear, and battery storage.', 2, id, 'Sun', 1
from public.categories where slug = 'environment-climate'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'EdTech & Learning', 'education-edtech', 'AI-assisted tutoring, online degrees, and digital classrooms.', 2, id, 'BookOpen', 1
from public.categories where slug = 'education'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Future of Work', 'jobs-future-of-work', 'Remote workflows, automation impacts, and developer hiring.', 2, id, 'Laptop', 1
from public.categories where slug = 'jobs-careers'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Major Leagues', 'sports-major-leagues', 'Global football, basketball, and racing championships.', 2, id, 'Activity', 1
from public.categories where slug = 'sports'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Gaming & Interactive', 'entertainment-gaming', 'Game design, GPU rendering engines, and esports.', 2, id, 'Gamepad2', 1
from public.categories where slug = 'entertainment-culture'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Productivity Systems', 'lifestyle-productivity', 'Deep work habits, knowledge management, and time tracking.', 2, id, 'CheckSquare', 1
from public.categories where slug = 'lifestyle'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Aviation & Transit', 'travel-aviation', 'Commercial aerospace, high-speed rail, and route networks.', 2, id, 'Plane', 1
from public.categories where slug = 'travel'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Food Technology', 'food-technology', 'Precision fermentation, vertical farming, and agtech.', 2, id, 'Coffee', 1
from public.categories where slug = 'food'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;


-- Level 3: Topics
insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'AI Models', 'ai-models', 'Frontier LLMs and multimodal architectures.', 3, id, null, 1
from public.categories where slug = 'technology-ai'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Generative AI', 'generative-ai', 'Diffusion models and synthetic media.', 3, id, null, 2
from public.categories where slug = 'technology-ai'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'AI Agents', 'ai-agents', 'Autonomous agents and tool orchestration.', 3, id, null, 3
from public.categories where slug = 'technology-ai'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'AI Infrastructure', 'ai-infrastructure', 'GPU clusters and training supercomputers.', 3, id, null, 4
from public.categories where slug = 'technology-ai'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'AI Applications', 'ai-applications', 'Enterprise and consumer intelligent systems.', 3, id, null, 5
from public.categories where slug = 'technology-ai'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Programming', 'programming', 'Rust, TypeScript, Python, Go, and systems code.', 3, id, null, 1
from public.categories where slug = 'technology-software'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Developer Tools', 'developer-tools', 'Compilers, build systems, and debuggers.', 3, id, null, 2
from public.categories where slug = 'technology-software'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Cloud Computing', 'cloud-computing', 'Serverless, Kubernetes, and hyperscalers.', 3, id, null, 3
from public.categories where slug = 'technology-software'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Open Source', 'open-source', 'Decentralized software and permissive code.', 3, id, null, 4
from public.categories where slug = 'technology-software'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Semiconductors', 'semiconductors', 'TSMC, ASML, lithography, and chip fabs.', 3, id, null, 1
from public.categories where slug = 'technology-hardware'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'CPUs', 'cpus', 'x86, ARM architectures, and RISC-V.', 3, id, null, 2
from public.categories where slug = 'technology-hardware'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'GPUs', 'gpus', 'NVIDIA, AMD silicon, and accelerators.', 3, id, null, 3
from public.categories where slug = 'technology-hardware'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Networking', 'networking', 'InfiniBand and optical switches.', 3, id, null, 4
from public.categories where slug = 'technology-hardware'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Interest Rates', 'interest-rates', 'Central bank policy and bond yields.', 3, id, null, 1
from public.categories where slug = 'business-macroeconomics'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Inflation & Wages', 'inflation-wages', 'Purchasing power and labor cost indices.', 3, id, null, 2
from public.categories where slug = 'business-macroeconomics'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Global Trade', 'global-trade', 'Supply chains, freight rates, and treaties.', 3, id, null, 3
from public.categories where slug = 'business-macroeconomics'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Early-Stage Startups', 'early-stage', 'Pre-seed and Series A funding rounds.', 3, id, null, 1
from public.categories where slug = 'business-vc'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'IPOs & M&A', 'ipos-ma', 'Public listings and corporate takeovers.', 3, id, null, 2
from public.categories where slug = 'business-vc'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'US Equities', 'us-equities', 'S&P 500, Nasdaq, and corporate quarterly earnings.', 3, id, null, 1
from public.categories where slug = 'finance-stock-markets'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Global Indices', 'global-indices', 'Nikkei, FTSE, and DAX benchmarks.', 3, id, null, 2
from public.categories where slug = 'finance-stock-markets'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Bitcoin', 'bitcoin', 'Spot ETFs, halving cycles, and mining dynamics.', 3, id, null, 1
from public.categories where slug = 'finance-crypto'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Ethereum & L2s', 'ethereum-l2', 'Smart contracts, rollups, and scaling networks.', 3, id, null, 2
from public.categories where slug = 'finance-crypto'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Spaceflight', 'spaceflight', 'Orbital rockets and lunar expeditions.', 3, id, null, 1
from public.categories where slug = 'science-space'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Cosmology', 'cosmology', 'James Webb observations and dark energy.', 3, id, null, 2
from public.categories where slug = 'science-space'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Oncology', 'oncology', 'Immunotherapies and targeted cancer therapies.', 3, id, null, 1
from public.categories where slug = 'health-medicine'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Longevity', 'longevity', 'Cellular rejuvenation and metabolic health.', 3, id, null, 2
from public.categories where slug = 'health-medicine'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Tech Regulation', 'tech-regulation', 'Antitrust, AI governance, and privacy statutes.', 3, id, null, 1
from public.categories where slug = 'politics-policy'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Elections', 'elections', 'Voter trends, debates, and election cycles.', 3, id, null, 2
from public.categories where slug = 'politics-policy'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Asia-Pacific', 'asia-pacific', 'Regional commerce and strategic corridors.', 3, id, null, 1
from public.categories where slug = 'world-geopolitics'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Europe', 'europe-affairs', 'EU policy, security pacts, and energy dynamics.', 3, id, null, 2
from public.categories where slug = 'world-geopolitics'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Solar & Wind', 'solar-wind', 'Utility-scale renewables and grid parity.', 3, id, null, 1
from public.categories where slug = 'environment-energy'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Nuclear Energy', 'nuclear-energy', 'Small modular reactors and fusion research.', 3, id, null, 2
from public.categories where slug = 'environment-energy'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'AI Tutoring', 'ai-tutoring', 'Personalized learning systems and adaptive curricula.', 3, id, null, 1
from public.categories where slug = 'education-edtech'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Remote Work', 'remote-work', 'Distributed teams and global talent sourcing.', 3, id, null, 1
from public.categories where slug = 'jobs-future-of-work'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Tech Compensation', 'tech-compensation', 'Salary benchmarks and equity packages.', 3, id, null, 2
from public.categories where slug = 'jobs-future-of-work'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Motorsports & F1', 'motorsports-f1', 'Grand Prix analysis and aerodynamics.', 3, id, null, 1
from public.categories where slug = 'sports-major-leagues'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Global Football', 'football-soccer', 'Champions League and international fixtures.', 3, id, null, 2
from public.categories where slug = 'sports-major-leagues'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Game Engines', 'game-engines', 'Unreal Engine 5 and real-time graphics.', 3, id, null, 1
from public.categories where slug = 'entertainment-gaming'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Deep Work', 'deep-work', 'Cognitive focus and cognitive load reduction.', 3, id, null, 1
from public.categories where slug = 'lifestyle-productivity'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Commercial Aviation', 'commercial-aviation', 'Fleet modernizations and airline alliances.', 3, id, null, 1
from public.categories where slug = 'travel-aviation'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.categories (name, slug, description, level, parent_id, icon, sort_order)
select 'Vertical Farming', 'vertical-farming', 'Controlled environment agriculture and hydroponics.', 3, id, null, 1
from public.categories where slug = 'food-technology'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  parent_id = excluded.parent_id,
  icon = excluded.icon,
  sort_order = excluded.sort_order;


-- 7. Force PostgREST schema cache reload
notify pgrst, 'reload schema';
