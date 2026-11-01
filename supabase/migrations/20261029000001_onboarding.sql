-- New-trainee onboarding: intake questionnaire, intro video, permission
-- consents, body measurements and private body photos.

-- ── 1. Onboarding state (one row per trainee) ────────────────────────────────
-- answers is saved after every questionnaire screen, so a trainee who leaves
-- mid-way resumes from current_step.
CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  user_id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  answers                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step               TEXT,
  questionnaire_completed_at TIMESTAMPTZ,
  intro_video_watched_at     TIMESTAMPTZ,
  -- {"steps": "granted"|"denied"|"skipped"|"unavailable", "notifications": …, "background": …}
  permissions                JSONB NOT NULL DEFAULT '{}'::jsonb,
  permissions_completed_at   TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own onboarding" ON public.onboarding_responses;
CREATE POLICY "Trainee manages own onboarding"
  ON public.onboarding_responses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read onboarding" ON public.onboarding_responses;
CREATE POLICY "Admins read onboarding"
  ON public.onboarding_responses FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Until this table existed the app kept onboarding state in the user's auth
-- metadata (user_metadata.onboarding). Carry it over first, so no one has to
-- fill the questionnaire in again and half-done ones resume where they were.
INSERT INTO public.onboarding_responses
  (user_id, answers, current_step, questionnaire_completed_at, intro_video_watched_at, permissions, permissions_completed_at)
SELECT u.id,
       COALESCE(m->'answers', '{}'::jsonb),
       m->>'current_step',
       NULLIF(m->>'questionnaire_completed_at', '')::timestamptz,
       NULLIF(m->>'intro_video_watched_at', '')::timestamptz,
       COALESCE(m->'permissions', '{}'::jsonb),
       NULLIF(m->>'permissions_completed_at', '')::timestamptz
FROM auth.users u
CROSS JOIN LATERAL (SELECT u.raw_user_meta_data->'onboarding' AS m) meta
WHERE jsonb_typeof(m) = 'object'
ON CONFLICT (user_id) DO NOTHING;

-- Existing trainees already use the app — never push them back through
-- onboarding. "Existing" = has body details (height or a starting weight):
-- accounts an admin just created (email + password only) still get the
-- questionnaire.
INSERT INTO public.onboarding_responses
  (user_id, questionnaire_completed_at, intro_video_watched_at, permissions, permissions_completed_at)
SELECT p.id, now(), now(), '{"legacy": true}'::jsonb, now()
FROM public.profiles p
WHERE p.height IS NOT NULL OR p.initial_weight IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ── 2. Profile fields filled from the questionnaire ──────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age                        INT,
  ADD COLUMN IF NOT EXISTS gender                     TEXT CHECK (gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS fitness_goal               TEXT,
  -- NULL = no strength plan at this stage; otherwise sessions per week.
  ADD COLUMN IF NOT EXISTS strength_sessions_per_week INT,
  ADD COLUMN IF NOT EXISTS weekly_walks_target        INT,
  -- Non-strength training kept as a standing activity: [{"type": "running", "per_week": 2}]
  ADD COLUMN IF NOT EXISTS regular_activities         JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── 3. Body measurements (cm) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  arm_cm      NUMERIC(5,1),
  chest_cm    NUMERIC(5,1),
  waist_cm    NUMERIC(5,1),
  belly_cm    NUMERIC(5,1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS body_measurements_user_date
  ON public.body_measurements (user_id, measured_at);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own measurements" ON public.body_measurements;
CREATE POLICY "Trainee manages own measurements"
  ON public.body_measurements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read measurements" ON public.body_measurements;
CREATE POLICY "Admins read measurements"
  ON public.body_measurements FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ── 4. Private body photos ───────────────────────────────────────────────────
-- Separate from transformation_photos (public bucket). Files live in a
-- PRIVATE bucket under <user_id>/…, readable only by the owner and admins
-- through short-lived signed URLs.
CREATE TABLE IF NOT EXISTS public.body_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  angle        TEXT NOT NULL CHECK (angle IN ('front', 'side', 'back')),
  storage_path TEXT NOT NULL,
  taken_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.body_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own body photos" ON public.body_photos;
CREATE POLICY "Trainee manages own body photos"
  ON public.body_photos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read body photos" ON public.body_photos;
CREATE POLICY "Admins read body photos"
  ON public.body_photos FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('body-photos', 'body-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Body photos: owner upload" ON storage.objects;
CREATE POLICY "Body photos: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Body photos: owner or admin read" ON storage.objects;
CREATE POLICY "Body photos: owner or admin read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'body-photos'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Body photos: owner delete" ON storage.objects;
CREATE POLICY "Body photos: owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
