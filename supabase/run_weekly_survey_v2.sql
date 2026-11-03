-- =============================================================================
-- Weekly survey v2: the questions are built per trainee in the app (weight,
-- each habit 1-10, and every second week the workout progress questions), so
-- the answers are kept as one JSON list of { key, question, answer }.
-- The old fixed questions (checkin_questions) are no longer asked; their past
-- answers stay in their columns.
-- Safe to run more than once.
-- =============================================================================
ALTER TABLE public.weekly_checkin
  ADD COLUMN IF NOT EXISTS answers JSONB;
COMMENT ON COLUMN public.weekly_checkin.answers IS
  'Survey v2: { version, workouts, items: [{ key, question, answer }] } in the order asked.';

-- Check: the column exists. Return this.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'weekly_checkin' AND column_name = 'answers';
