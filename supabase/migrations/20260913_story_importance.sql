-- =====================================================================
-- Personal Intelligence - Step 2K: Story Importance Scoring Index
-- =====================================================================

-- 1. Create index for sorting and filtering stories by importance
create index if not exists stories_importance_score_idx
on public.stories(importance_score desc nulls last);

-- 2. Create compound index for active stories ordered by importance
create index if not exists stories_active_importance_idx
on public.stories(status, importance_score desc nulls last);

-- 3. Reload PostgREST schema cache
notify pgrst, 'reload schema';
