-- =====================================================
-- Add is_bonus flag to habit_definitions
-- Bonus habits are shown but do not count toward
-- the daily streak / "perfect day" calculation.
-- =====================================================

ALTER TABLE public.habit_definitions
  ADD COLUMN IF NOT EXISTS is_bonus BOOLEAN NOT NULL DEFAULT false;
