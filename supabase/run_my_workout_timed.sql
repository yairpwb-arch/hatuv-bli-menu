-- =============================================================================
-- "בנה אימון": תרגילים בזמן (ריצה, פלאנק). להדביק ב-SQL Editor ולהריץ.
-- בטוח להרצה כפולה.
-- =============================================================================
BEGIN;

ALTER TABLE public.my_workout_exercises
  ADD COLUMN IF NOT EXISTS duration_seconds INT CHECK (duration_seconds BETWEEN 5 AND 14400);
COMMENT ON COLUMN public.my_workout_exercises.duration_seconds IS 'Set = timed exercise: seconds per set (reps and weight are NULL).';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- בדיקה: צריך להחזיר true
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'my_workout_exercises' AND column_name = 'duration_seconds') AS ok;
