-- =============================================================================
-- 1. The rules: the health line split into "must hand off" and "no hand-off".
-- 2. The model test's tables (cases are loaded by a private file; results are
--    written by the bot-jobs function). Admins only. Safe to run more than once.
-- =============================================================================
BEGIN;

UPDATE public.bot_settings
SET value = to_jsonb(replace(value #>> '{}',
  '- לא עצה רפואית, לא שינוי תרופות או טיפול. כאב, פציעה, מחלה, תרופות, הריון: מגיבים באמפתיה, אומרים שתעביר למאמנים, ומסמנים [העבר].',
  '- לא עצה רפואית, לא שינוי תרופות או טיפול.
- חובה להעביר (אומרים שתעביר למאמנים ומסמנים [העבר]): מיון או בית חולים, פציעה חדשה או כאב חדש שמשפיעים על אימון, שאלה על תרופות או טיפול, הריון, סימנים לאכילה לא בריאה.
- בלי העברה: מצב רפואי מוכר שכבר בטיפול (למשל מחלה כרונית, או כשהלקוח כבר אצל רופא), ומחלה רגילה (חום, צינון, קלקול קיבה). מגיבים באמפתיה, מתאימים את ההרגלים (מנוחה, שתייה), לא נותנים הוראות רפואיות, ולא מציעים להתאמן עד שמרגישים טוב.'))
WHERE key = 'rules';

-- The test's questions (one per row), with the history before each and the test client's data.
CREATE TABLE IF NOT EXISTS public.bot_eval_cases (
  no          INT PRIMARY KEY,
  question    TEXT NOT NULL,
  ours        TEXT NOT NULL,          -- our answer (⏎ = a separate message)
  history     JSONB NOT NULL DEFAULT '[]',
  client_name TEXT,
  ctx         TEXT NOT NULL,          -- the test client's data, as the bot gets it
  day         INT NOT NULL,           -- the test client's day (what of the program is open)
  checks      JSONB NOT NULL DEFAULT '[]'
);
ALTER TABLE public.bot_eval_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read eval cases" ON public.bot_eval_cases;
CREATE POLICY "Admins read eval cases" ON public.bot_eval_cases FOR SELECT USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.bot_eval_results (
  id         BIGSERIAL PRIMARY KEY,
  run_id     TEXT NOT NULL,
  case_no    INT NOT NULL,
  model      TEXT NOT NULL,
  answer     TEXT,                    -- the model's raw text ([העבר] kept)
  score      INT,                     -- 1–10 against our answer
  passed     BOOLEAN,                 -- every must-pass check passed
  checks     JSONB,                   -- [{ id, text, passed, why }]
  note       TEXT,                    -- the judge's one line
  cost_usd   NUMERIC(12, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, case_no, model)
);
ALTER TABLE public.bot_eval_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read eval results" ON public.bot_eval_results;
CREATE POLICY "Admins read eval results" ON public.bot_eval_results FOR SELECT USING (public.is_admin());

COMMIT;

-- Check: the rules have both new lines (true, true), and the two tables exist (2). Return this.
SELECT
  position('חובה להעביר' IN (SELECT value #>> '{}' FROM public.bot_settings WHERE key = 'rules')) > 0 AS rule_must,
  position('בלי העברה' IN (SELECT value #>> '{}' FROM public.bot_settings WHERE key = 'rules')) > 0 AS rule_no_handoff,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('bot_eval_cases', 'bot_eval_results')) AS tables;
