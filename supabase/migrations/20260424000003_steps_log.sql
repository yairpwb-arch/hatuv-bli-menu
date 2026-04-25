-- =====================================================
-- Steps Log Table
-- Stores daily step counts per user (upsert by user_id + date)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.steps_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  steps       INT         NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.steps_log ENABLE ROW LEVEL SECURITY;

-- Users can read and write only their own rows
DROP POLICY IF EXISTS "Users can manage own steps" ON public.steps_log;
CREATE POLICY "Users can manage own steps"
  ON public.steps_log FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
