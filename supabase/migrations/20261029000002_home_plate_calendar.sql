-- Home screen: habit plate + personal calendar.

-- ── 1. Habits on the plate ───────────────────────────────────────────────────
-- Habits per stage already live in habit_definitions (day_start/day_end) and
-- daily ticks in daily_habits_log. Added: the one-line explanation shown on
-- long-press, and where the habit sits on the plate illustration.
ALTER TABLE public.habit_definitions
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD COLUMN IF NOT EXISTS plate_zone  TEXT NOT NULL DEFAULT 'side'
    CHECK (plate_zone IN ('plate', 'side'));

COMMENT ON COLUMN public.habit_definitions.explanation IS
  'One sentence shown on long-press, e.g. "2 כוסות מים לפני הארוחה – מעלה שובע ומונע אכילה מופרזת"';
COMMENT ON COLUMN public.habit_definitions.plate_zone IS
  '"plate" = drawn inside the plate (protein/carbs/veg), "side" = around it (water, walk…)';

-- ── 2. Calendar events ───────────────────────────────────────────────────────
-- Trainee-created events. Recurring walks/workouts keep coming from
-- user_activity_schedule / workout_day_schedule and are merged in the client.
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('walk', 'workout', 'meal', 'sleep', 'other')),
  title      TEXT NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ,
  notes      TEXT,
  done_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_events_user_start
  ON public.calendar_events (user_id, starts_at);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own events" ON public.calendar_events;
CREATE POLICY "Trainee manages own events"
  ON public.calendar_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read events" ON public.calendar_events;
CREATE POLICY "Admins read events"
  ON public.calendar_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
