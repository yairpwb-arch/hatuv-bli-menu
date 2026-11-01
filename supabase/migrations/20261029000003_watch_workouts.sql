-- Workouts imported from smartwatches through Apple Health (HealthKit) or
-- Health Connect. Stored server-side so history, the admin panel and the
-- trainee's other devices all see the same list.
CREATE TABLE IF NOT EXISTS public.external_workouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('healthkit', 'health_connect')),
  -- The health store's own id, so re-syncing never duplicates a workout.
  external_id   TEXT NOT NULL,
  -- Normalised kind: strength / walk / run / cycling / swim / other
  kind          TEXT NOT NULL,
  -- Raw type from the health store, kept for debugging and future mapping.
  raw_type      TEXT,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL,
  duration_min  INT NOT NULL,
  calories      INT,
  avg_heart_rate INT,
  source_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);

CREATE INDEX IF NOT EXISTS external_workouts_user_start
  ON public.external_workouts (user_id, started_at DESC);

ALTER TABLE public.external_workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own watch workouts" ON public.external_workouts;
CREATE POLICY "Trainee manages own watch workouts"
  ON public.external_workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read watch workouts" ON public.external_workouts;
CREATE POLICY "Admins read watch workouts"
  ON public.external_workouts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
