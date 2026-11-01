-- Daily summary (replaces the weekly survey), sleep hours, slow-eating retired.
-- Run after 20261030000001_table_and_workout_sets.sql.
--
-- 1. profiles.sleep_time / wake_time — the trainee's sleep hours (Settings).
--    NULL = not set yet; the app falls back to the intake questionnaire.
-- 2. daily_summaries — one row per trainee per day, answered around bedtime.
--    Each habit answer is keyed by habit_id; "yes" answers are also written to
--    daily_habits_log by the app so they count for streaks and perfect days.
-- 3. checkin_questions — the weekly survey is switched off (rows and answers kept).
-- 4. "אכילה איטית" is hidden from every stage (day_end = 0). Its rows and the
--    trainees' past ticks stay, so history doesn't change.

-- ── 1. Sleep hours ───────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sleep_time TIME,
  ADD COLUMN IF NOT EXISTS wake_time  TIME;

COMMENT ON COLUMN public.profiles.sleep_time IS 'Bedtime (local). Drives the daily summary window, night mode and quiet hours for push.';
COMMENT ON COLUMN public.profiles.wake_time  IS 'Wake-up time (local). End of night mode / quiet hours.';

-- ── 2. daily_summaries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_summaries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date  DATE        NOT NULL,
  -- { "<habit_id>": "yes" | "partial" | "no" }
  answers       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Thursday only (weekly check-in questions), 1–5
  energy        SMALLINT    CHECK (energy BETWEEN 1 AND 5),
  hunger        SMALLINT    CHECK (hunger BETWEEN 1 AND 5),
  proud_of      TEXT,
  -- Habits done that day (table + summary) when it was sent — for the admin view.
  habits_done   INT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, summary_date)
);

ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own summaries" ON public.daily_summaries;
CREATE POLICY "Trainee manages own summaries"
  ON public.daily_summaries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read summaries" ON public.daily_summaries;
CREATE POLICY "Admins read summaries"
  ON public.daily_summaries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ── 3. Weekly survey off ─────────────────────────────────────────────────────
UPDATE public.checkin_questions SET is_active = false;

-- ── 4. Slow eating hidden ────────────────────────────────────────────────────
UPDATE public.habit_definitions
SET day_end = 0
WHERE visual_key = 'slow_eating' OR name ILIKE '%אכילה איטית%';
