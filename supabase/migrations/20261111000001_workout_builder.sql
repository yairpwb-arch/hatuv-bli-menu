-- The workout bot: builds a trainee's workout plan from the coaches' principles
-- and template workouts. A plan it builds is a draft until a coach approves it.

-- 1. Template workouts the coaches write (the bot picks one and fits it to the trainee).
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  audience   TEXT,                -- who it's for, e.g. "מתחילים, בבית, בלי ציוד"
  body       TEXT NOT NULL DEFAULT '',
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage workout templates" ON public.workout_templates;
CREATE POLICY "Admins manage workout templates" ON public.workout_templates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2. Plans the bot built: building → pending (waits for a coach) → approved / rejected; failed.
--    kind: 'initial' = after the opening questionnaire; 'request' = the trainee or a coach asked.
CREATE TABLE IF NOT EXISTS public.bot_workout_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('initial', 'request')),
  status      TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'pending', 'approved', 'rejected', 'failed')),
  request     TEXT,                -- what was asked (the trainee's words, or the coach's)
  note        TEXT,                -- a coach's note for building it again
  chat_id     TEXT,                -- the group the request came from
  plan        JSONB,               -- { days: [{ stage, name, replaces?, exercises: [...] }] }
  rationale   TEXT,                -- for the coach: why this plan
  template    TEXT,                -- the template it started from
  model       TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ,
  decided_by  UUID
);
CREATE INDEX IF NOT EXISTS bot_workout_plans_user ON public.bot_workout_plans (user_id, created_at DESC);
-- One open plan (being built or waiting) per trainee.
CREATE UNIQUE INDEX IF NOT EXISTS bot_workout_plans_one_open
  ON public.bot_workout_plans (user_id) WHERE status IN ('building', 'pending');
ALTER TABLE public.bot_workout_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage bot workout plans" ON public.bot_workout_plans;
CREATE POLICY "Admins manage bot workout plans" ON public.bot_workout_plans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. The coaches' principles (free text, edited in the admin), and from when plans are
--    built automatically: only questionnaires finished from now on (older trainees: by hand).
INSERT INTO public.bot_settings (key, value) VALUES ('workout_principles', to_jsonb(''::text))
  ON CONFLICT (key) DO NOTHING;
INSERT INTO public.bot_settings (key, value) VALUES ('workout_builder_since', to_jsonb(now()::text))
  ON CONFLICT (key) DO NOTHING;

-- 4. Every 15 minutes: plans for questionnaires just finished.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'bot-plans';
SELECT cron.schedule('bot-plans', '*/15 * * * *', $$SELECT public.trigger_bot_job('plans')$$);

-- Check: return this.
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workout_templates') AS templates_table,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bot_workout_plans') AS plans_table,
  (SELECT count(*) FROM public.bot_settings WHERE key IN ('workout_principles', 'workout_builder_since')) AS settings,   -- 2
  (SELECT count(*) FROM cron.job WHERE jobname = 'bot-plans') AS cron_job;                                              -- 1
