-- Repeating calendar events ("כל יום" / fixed weekdays, optionally until a date)
-- with single-occurrence exceptions. Walks and workouts that repeat live in
-- the training plan (user_walking_schedule / workout_day_schedule), not here.
-- Safe to run more than once.

ALTER TABLE public.calendar_events
  -- NULL = a one-off event.
  ADD COLUMN IF NOT EXISTS repeat_rule   TEXT CHECK (repeat_rule IN ('daily', 'weekly')),
  -- weekly: which weekdays (0 = Sunday).
  ADD COLUMN IF NOT EXISTS repeat_days   SMALLINT[],
  -- Last day of the series; NULL = no end.
  ADD COLUMN IF NOT EXISTS repeat_until  DATE,
  -- Occurrences removed or replaced by a one-off copy ("רק האירוע הזה").
  ADD COLUMN IF NOT EXISTS excluded_days DATE[] NOT NULL DEFAULT '{}',
  -- A one-off copy of one occurrence: its series and the day it stands in for.
  ADD COLUMN IF NOT EXISTS parent_id     UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS original_day  DATE;

CREATE INDEX IF NOT EXISTS calendar_events_user_repeat
  ON public.calendar_events (user_id) WHERE repeat_rule IS NOT NULL;

-- Walks added from the calendar ("כל יום" / fixed days) join the training
-- plan's walk days, so the plan may hold up to one walk per weekday
-- (walk_number 1–2 stay the program's own walks).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_walking_schedule_walk_number_check') THEN
    ALTER TABLE public.user_walking_schedule DROP CONSTRAINT user_walking_schedule_walk_number_check;
  END IF;
  ALTER TABLE public.user_walking_schedule
    ADD CONSTRAINT user_walking_schedule_walk_number_check CHECK (walk_number BETWEEN 1 AND 7);
END $$;
