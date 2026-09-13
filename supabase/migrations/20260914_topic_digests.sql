-- Migration: 20260914_topic_digests.sql
-- Description: Topic Digest & Intelligence Briefings with Row-Level Security

-- 1. Create topic_digests table
CREATE TABLE IF NOT EXISTS public.topic_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  title text NOT NULL,
  executive_summary text NOT NULL,
  key_developments jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  story_count integer NOT NULL DEFAULT 0,
  important_story_count integer NOT NULL DEFAULT 0,
  model text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_topic_digests_user_period UNIQUE(user_id, period_type, period_start, period_end)
);

-- 2. Indexes for topic_digests
CREATE INDEX IF NOT EXISTS idx_topic_digests_user_created ON public.topic_digests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_digests_user_period ON public.topic_digests(user_id, period_type, period_start);

-- 3. Create topic_digest_stories junction table
CREATE TABLE IF NOT EXISTS public.topic_digest_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_id uuid NOT NULL REFERENCES public.topic_digests(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  importance_score numeric,
  is_important boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_topic_digest_stories_digest_story UNIQUE(digest_id, story_id)
);

-- 4. Indexes for topic_digest_stories
CREATE INDEX IF NOT EXISTS idx_topic_digest_stories_digest_rank ON public.topic_digest_stories(digest_id, rank ASC);
CREATE INDEX IF NOT EXISTS idx_topic_digest_stories_story ON public.topic_digest_stories(story_id);

-- 5. Enable Row-Level Security
ALTER TABLE public.topic_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_digest_stories ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for topic_digests
CREATE POLICY "Users can view own topic digests"
  ON public.topic_digests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own topic digests"
  ON public.topic_digests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own topic digests"
  ON public.topic_digests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own topic digests"
  ON public.topic_digests FOR DELETE
  USING (auth.uid() = user_id);

-- 7. RLS Policies for topic_digest_stories
CREATE POLICY "Users can view stories of own topic digests"
  ON public.topic_digest_stories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.topic_digests
      WHERE public.topic_digests.id = public.topic_digest_stories.digest_id
        AND public.topic_digests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert stories for own topic digests"
  ON public.topic_digest_stories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.topic_digests
      WHERE public.topic_digests.id = public.topic_digest_stories.digest_id
        AND public.topic_digests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete stories for own topic digests"
  ON public.topic_digest_stories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.topic_digests
      WHERE public.topic_digests.id = public.topic_digest_stories.digest_id
        AND public.topic_digests.user_id = auth.uid()
    )
  );

-- 8. Table grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_digests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_digest_stories TO authenticated, service_role;
