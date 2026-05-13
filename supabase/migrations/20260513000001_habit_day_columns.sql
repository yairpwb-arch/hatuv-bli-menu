-- Add day_start and day_end to habit_definitions so habits unlock on exact program days.
-- All users start on Saturday (day 1). Habits appear from Sunday (day 2) of each week.
--
-- Conversion from existing week data:
--   day_start = (week_start - 1) * 7 + 2   (first Sunday of that program week)
--   day_end   = week_end * 7 + 1            (last Saturday the habit is shown)

ALTER TABLE public.habit_definitions
  ADD COLUMN IF NOT EXISTS day_start INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS day_end   INT;

-- Migrate all existing habits (global and personal) from week to day values
UPDATE public.habit_definitions
SET
  day_start = (week_start - 1) * 7 + 2,
  day_end   = CASE WHEN week_end IS NOT NULL THEN week_end * 7 + 1 ELSE NULL END;
