-- 1. Program length: 6 months = 26 weeks (182 days), 10 months = 40 weeks (280 days).
--    Trainees on the old 36-week length (252) — and any added with the first
--    10-month length (43 weeks, 301) — move to 40 weeks. New trainees default to 40.
ALTER TABLE public.profiles ALTER COLUMN plan_duration_days SET DEFAULT 280;
UPDATE public.profiles SET plan_duration_days = 280 WHERE plan_duration_days IN (252, 301);

-- 2. A walk / workout the trainee planned in the calendar can point at a workout
--    they built ("האימונים שלי"), so "התחל אימון" runs it in the workout player.
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS my_workout_id UUID REFERENCES public.my_workouts(id) ON DELETE SET NULL;

-- Check: return this.
SELECT
  (SELECT count(*) FROM public.profiles WHERE plan_duration_days NOT IN (182, 280)) AS other_lengths,
  (SELECT count(*) FROM public.profiles WHERE plan_duration_days = 280) AS ten_months,
  (SELECT count(*) FROM public.profiles WHERE plan_duration_days = 182) AS six_months,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'my_workout_id'
  ) AS planned_workout_column;
