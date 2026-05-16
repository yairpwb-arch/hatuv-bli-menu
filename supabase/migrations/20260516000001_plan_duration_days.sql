-- Add plan_duration_days to profiles.
-- 120 = 4-month plan, 168 = 6-month plan (default, matches existing program length).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_duration_days INT NOT NULL DEFAULT 168;
