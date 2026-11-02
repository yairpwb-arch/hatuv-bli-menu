-- =============================================================================
-- Walks and workouts open when their video is watched. Paste into the SQL Editor and run.
-- Run this one BEFORE the new app version reaches anyone. Older versions ignore it.
-- =============================================================================
BEGIN;

-- A walk or a workout opens when its video is watched, and the trainee then picks
-- its weekday. Which video opens what is data, not code:
--   program_content.unlocks        what this video opens
--   workout_plan_days.unlocks_with the video a day built ahead is waiting for
--                                  (NULL = open from the start)
-- Safe to run more than once.

ALTER TABLE public.program_content
  ADD COLUMN IF NOT EXISTS unlocks TEXT CHECK (unlocks IN ('walk_1', 'walk_2', 'workout_1', 'workout_2'));
COMMENT ON COLUMN public.program_content.unlocks IS 'What this video opens once it is marked watched.';

ALTER TABLE public.workout_plan_days
  ADD COLUMN IF NOT EXISTS unlocks_with TEXT CHECK (unlocks_with IN ('workout_1', 'workout_2'));
COMMENT ON COLUMN public.workout_plan_days.unlocks_with IS 'Built ahead: stays hidden until this video is watched. NULL = open from the start.';

UPDATE public.program_content c
SET unlocks = v.unlocks
FROM (VALUES
  ('שבוע 1:%', 'walk_1'),
  ('שבוע 4:%', 'walk_2'),
  ('שבועות 5–6:%', 'workout_1'),
  ('שבועות 9–10:%', 'workout_2')
) AS v(pattern, unlocks)
WHERE c.title LIKE v.pattern AND c.content_type = 'video' AND c.archived_at IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Check: 4 rows, each video with what it opens. Return this table.
SELECT title, unlock_day, unlocks FROM public.program_content WHERE unlocks IS NOT NULL AND archived_at IS NULL ORDER BY unlock_day;
