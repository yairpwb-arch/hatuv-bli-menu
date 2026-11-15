-- =============================================================================
-- The questionnaires, edited in the admin (שאלונים → שאלות): the opening
-- questionnaire, the weekly survey and its workout part (every second week).
--
-- The questions themselves live in the app's code (they decide the trainee's
-- track, plan, weight, habits...). A row here changes how a question reads, or
-- adds a question of the coaches':
--   * a built-in question (is_custom = false): its title / subtitle, its option
--     labels (same values, other words), or hidden (only questions the app
--     doesn't rely on can be hidden; the admin locks the others);
--   * a question the coaches added (is_custom = true): any kind, any options,
--     required or not, its place among the added ones (sort_order).
-- The answers are saved with the rest (onboarding_responses / weekly_checkin).
-- Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.questionnaire_texts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire TEXT        NOT NULL CHECK (questionnaire IN ('onboarding', 'weekly', 'workout')),
  key           TEXT        NOT NULL,
  title         TEXT,
  subtitle      TEXT,
  -- [{ "value": "...", "label": "..." }]: for a built-in question only the labels count.
  options       JSONB,
  hidden        BOOLEAN     NOT NULL DEFAULT false,
  is_custom     BOOLEAN     NOT NULL DEFAULT false,
  kind          TEXT        CHECK (kind IS NULL OR kind IN ('text', 'long_text', 'number', 'single', 'multi', 'scale', 'yes_no')),
  required      BOOLEAN     NOT NULL DEFAULT true,
  sort_order    INT         NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (questionnaire, key),
  CHECK (NOT is_custom OR (kind IS NOT NULL AND title IS NOT NULL))
);

ALTER TABLE public.questionnaire_texts ENABLE ROW LEVEL SECURITY;

-- Every signed-in trainee reads them (the app builds the questionnaire with them).
DROP POLICY IF EXISTS "Signed in read questionnaire texts" ON public.questionnaire_texts;
CREATE POLICY "Signed in read questionnaire texts" ON public.questionnaire_texts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage questionnaire texts" ON public.questionnaire_texts;
CREATE POLICY "Admins manage questionnaire texts" ON public.questionnaire_texts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Check: the table, empty until something is edited. Return this.
SELECT count(*) AS rows FROM public.questionnaire_texts;
