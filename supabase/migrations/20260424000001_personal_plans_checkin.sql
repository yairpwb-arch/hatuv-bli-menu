-- =====================================================
-- Personal Plans + Weekly Checkin Migration
-- 1. Add user_id to workout_plans (per-trainee plans)
-- 2. Create weekly_checkin table (fixed 13 questions)
-- =====================================================

-- 1. Add user_id to workout_plans (nullable — existing global plans keep NULL)
ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Weekly check-in table (replaces dynamic survey for this fixed questionnaire)
CREATE TABLE IF NOT EXISTS public.weekly_checkin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Q1
  full_name TEXT,
  -- Q2: last week's weigh-in
  last_weigh_in NUMERIC(5,2),
  -- Q3: today's weight
  weight_today NUMERIC(5,2),
  -- Q4-8: scale 1-10
  habits_score INT CHECK (habits_score BETWEEN 1 AND 10),
  walking_score INT CHECK (walking_score BETWEEN 1 AND 10),
  hunger_score INT CHECK (hunger_score BETWEEN 1 AND 10),
  energy_score INT CHECK (energy_score BETWEEN 1 AND 10),
  water_score INT CHECK (water_score BETWEEN 1 AND 10),
  -- Q9: sleep hours
  sleep_hours NUMERIC(4,1),
  -- Q10: bowel issues (yes/no)
  had_bowel_issues BOOLEAN,
  -- Q11-12: free text
  proud_of TEXT,
  to_improve TEXT,
  -- Q13: met last week's goal
  met_last_goal BOOLEAN,
  UNIQUE (user_id, week_number)
);

ALTER TABLE public.weekly_checkin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own checkins" ON public.weekly_checkin;
CREATE POLICY "Users can manage their own checkins"
  ON public.weekly_checkin FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all checkins" ON public.weekly_checkin;
CREATE POLICY "Admins can view all checkins"
  ON public.weekly_checkin FOR SELECT
  USING (public.is_admin());
