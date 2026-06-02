-- Add is_duration flag to workout_plan_exercises.
-- When true: reps_min stores duration in seconds (reps_max = reps_min).
ALTER TABLE public.workout_plan_exercises
  ADD COLUMN IF NOT EXISTS is_duration BOOLEAN NOT NULL DEFAULT false;
