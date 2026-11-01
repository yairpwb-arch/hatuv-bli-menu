-- "בנה אימון": an exercise can be done for a time per set (running, a plank)
-- instead of reps. NULL = reps as before.
ALTER TABLE public.my_workout_exercises
  ADD COLUMN IF NOT EXISTS duration_seconds INT CHECK (duration_seconds BETWEEN 5 AND 14400);
COMMENT ON COLUMN public.my_workout_exercises.duration_seconds IS 'Set = timed exercise: seconds per set (reps and weight are NULL).';
