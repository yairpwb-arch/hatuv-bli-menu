-- Activities: every workout / walk / sport a trainee did or planned, in one
-- table; GPS routes kept apart (owner-only); saved "my workouts".
-- Safe to run more than once.

-- ── 1. activities ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- English keys; the app shows the Hebrew names.
  kind            TEXT        NOT NULL CHECK (kind IN (
                    'strength_gym', 'strength_home', 'walk', 'run', 'cycling', 'spinning',
                    'swim', 'football', 'basketball', 'racket', 'martial_arts',
                    'yoga_pilates', 'hiit', 'studio_class', 'hike', 'dance', 'other'
                  )),
  -- The trainee's own name for "other".
  custom_name     TEXT,
  status          TEXT        NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'planned')),
  started_at      TIMESTAMPTZ NOT NULL,
  -- The day it counts for, in Israel time (set by the trigger below), so a
  -- 00:30 walk counts for the right day whatever the server's clock.
  day             DATE        NOT NULL,
  duration_min    INT         CHECK (duration_min > 0 AND duration_min <= 1440),
  distance_m      INT         CHECK (distance_m >= 0),
  intensity       TEXT        CHECK (intensity IN ('easy', 'medium', 'hard')),
  note            TEXT,
  steps           INT         CHECK (steps >= 0),
  calories        INT         CHECK (calories >= 0),
  avg_pace_sec_km INT         CHECK (avg_pace_sec_km > 0),
  -- manual = typed in, gps = tracked in the app, player = the workout player,
  -- watch = Apple Health / Health Connect.
  source          TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'gps', 'player', 'watch')),
  -- "This replaces today's workout / walk": the planned one counts as done.
  replaces        TEXT        CHECK (replaces IN ('workout', 'walk')),
  -- The workout player's record, when the activity ran in the player.
  session_id      UUID        REFERENCES public.workout_session_logs(id) ON DELETE SET NULL,
  -- The health store's id, so a watch workout is never imported twice.
  external_id     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activities_user_day ON public.activities (user_id, day DESC);
CREATE UNIQUE INDEX IF NOT EXISTS activities_user_external
  ON public.activities (user_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activities_session
  ON public.activities (session_id) WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activities_set_day()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.day := (NEW.started_at AT TIME ZONE 'Asia/Jerusalem')::date;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activities_set_day ON public.activities;
CREATE TRIGGER activities_set_day
BEFORE INSERT OR UPDATE OF started_at ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.activities_set_day();

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own activities" ON public.activities;
CREATE POLICY "Trainee manages own activities"
  ON public.activities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins see the summary (kind, time, distance, steps) — never the route.
DROP POLICY IF EXISTS "Admins read activities" ON public.activities;
CREATE POLICY "Admins read activities"
  ON public.activities FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ── 2. activity_tracks (GPS route) — the trainee only ────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_tracks (
  activity_id UUID        PRIMARY KEY REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Encoded polyline of the filtered points.
  path        TEXT        NOT NULL,
  -- [{ "km": 1, "sec": 702 }, …]
  splits      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- { "minLat": …, "minLng": …, "maxLat": …, "maxLng": … }
  bounds      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_tracks ENABLE ROW LEVEL SECURITY;

-- Deliberately no admin policy: a route can reveal where someone lives.
DROP POLICY IF EXISTS "Trainee manages own tracks" ON public.activity_tracks;
CREATE POLICY "Trainee manages own tracks"
  ON public.activity_tracks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_id AND a.user_id = auth.uid())
  );

-- ── 3. my_workouts — "the workout I built", reusable ─────────────────────────
CREATE TABLE IF NOT EXISTS public.my_workouts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.my_workout_exercises (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id  UUID         NOT NULL REFERENCES public.my_workouts(id) ON DELETE CASCADE,
  exercise_id UUID         NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  position    INT          NOT NULL DEFAULT 0,
  sets        INT          NOT NULL DEFAULT 3 CHECK (sets BETWEEN 1 AND 20),
  reps        INT          CHECK (reps BETWEEN 1 AND 100),
  weight_kg   NUMERIC(6,2) CHECK (weight_kg >= 0)
);

CREATE INDEX IF NOT EXISTS my_workouts_user ON public.my_workouts (user_id);
CREATE INDEX IF NOT EXISTS my_workout_exercises_workout ON public.my_workout_exercises (workout_id, position);

ALTER TABLE public.my_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_workout_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own workouts" ON public.my_workouts;
CREATE POLICY "Trainee manages own workouts"
  ON public.my_workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read my workouts" ON public.my_workouts;
CREATE POLICY "Admins read my workouts"
  ON public.my_workouts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Trainee manages own workout exercises" ON public.my_workout_exercises;
CREATE POLICY "Trainee manages own workout exercises"
  ON public.my_workout_exercises FOR ALL
  USING (EXISTS (SELECT 1 FROM public.my_workouts w WHERE w.id = workout_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.my_workouts w WHERE w.id = workout_id AND w.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins read my workout exercises" ON public.my_workout_exercises;
CREATE POLICY "Admins read my workout exercises"
  ON public.my_workout_exercises FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ── 4. Workouts marked "בלי האפליקציה": notes JSON → real columns ────────────
-- They were saved as workout_session_logs rows with notes like
-- {"source":"manual","difficulty":"hard"}. Each gets an activity (source,
-- intensity, duration as columns), the session keeps its difficulty in the
-- column added by 20261030000001, and the JSON note is cleared.
INSERT INTO public.activities (user_id, kind, status, started_at, day, duration_min, intensity, source, session_id)
SELECT s.user_id,
       'strength_gym',
       'done',
       s.completed_at,
       (s.completed_at AT TIME ZONE 'Asia/Jerusalem')::date,
       NULLIF(s.duration_minutes, 0),
       CASE WHEN s.notes::jsonb->>'difficulty' IN ('easy', 'medium', 'hard') THEN s.notes::jsonb->>'difficulty' END,
       'manual',
       s.id
FROM public.workout_session_logs s
-- pg_input_is_valid first (inside CASE, so the cast never runs on a non-JSON note).
WHERE CASE WHEN pg_input_is_valid(s.notes, 'jsonb') THEN s.notes::jsonb->>'source' = 'manual' ELSE false END
ON CONFLICT DO NOTHING;

UPDATE public.workout_session_logs
SET difficulty = COALESCE(difficulty,
      CASE WHEN notes::jsonb->>'difficulty' IN ('easy', 'medium', 'hard') THEN notes::jsonb->>'difficulty' END),
    notes = NULL
WHERE CASE WHEN pg_input_is_valid(notes, 'jsonb') THEN notes::jsonb->>'source' = 'manual' ELSE false END;
