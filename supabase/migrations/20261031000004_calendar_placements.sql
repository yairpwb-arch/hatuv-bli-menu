-- Where a recurring calendar item sits in the day, when the trainee moved it:
-- "only this date" (an exception) or "every <weekday>" (its fixed time).
-- Items: a workout ("workout:<plan_day_id>"), the walk ("walk"), a meal
-- ("meal:<key>"). Items without a row are placed automatically by the app.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.calendar_placements (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key     TEXT        NOT NULL,
  -- 'date' → day is set; 'weekday' → weekday is set (0 = Sunday).
  scope        TEXT        NOT NULL CHECK (scope IN ('date', 'weekday')),
  day          DATE,
  weekday      SMALLINT    CHECK (weekday BETWEEN 0 AND 6),
  start_time   TIME        NOT NULL,
  duration_min INT         CHECK (duration_min > 0 AND duration_min <= 600),
  -- A weekday time applies from this date on; days before keep the earlier time.
  valid_from   DATE        NOT NULL DEFAULT CURRENT_DATE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope = 'date' AND day IS NOT NULL AND weekday IS NULL)
      OR (scope = 'weekday' AND weekday IS NOT NULL AND day IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_placements_date
  ON public.calendar_placements (user_id, item_key, day) WHERE scope = 'date';
CREATE UNIQUE INDEX IF NOT EXISTS calendar_placements_weekday
  ON public.calendar_placements (user_id, item_key, weekday, valid_from) WHERE scope = 'weekday';

ALTER TABLE public.calendar_placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own placements" ON public.calendar_placements;
CREATE POLICY "Trainee manages own placements"
  ON public.calendar_placements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read placements" ON public.calendar_placements;
CREATE POLICY "Admins read placements"
  ON public.calendar_placements FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
