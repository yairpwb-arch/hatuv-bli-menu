-- =============================================================================
-- כל המיגרציות שעוד לא רצו + הטבלאות החדשות — קובץ אחד, לפי הסדר.
-- נוצר 2026-10-31. להדביק את כל הקובץ ב-SQL Editor של Supabase ולהריץ.
--
-- * כל קטע בטוח להרצה כפולה (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT).
-- * הקובץ רץ כטרנזקציה אחת: אם משהו נכשל — שום דבר לא נשמר, ואפשר לתקן ולהריץ שוב.
-- * אחרי כל קטע יש שאילתת בדיקה. ה-SQL Editor מציג רק את התוצאה האחרונה,
--   לכן בסוף יש טבלת סיכום אחת עם כל הבדיקות — את זו להחזיר לי.
--   (אפשר גם להריץ כל קטע לבד, יחד עם שאילתת הבדיקה שאחריו.)
-- * לפני ההרצה: גיבוי (scripts\backup-db.ps1).
-- =============================================================================

BEGIN;

-- #############################################################################
-- 0. בדיקה מקדימה: הטבלאות והפונקציות הקיימות שהקובץ משנה או נשען עליהן.
--    אם משהו חסר, עוצרים כאן לפני כל שינוי, עם שם החסר.
-- #############################################################################
DO $$
DECLARE
  missing TEXT[];
BEGIN
  SELECT array_agg(t ORDER BY t) INTO missing
  FROM unnest(ARRAY['activity_log', 'app_settings', 'checkin_questions', 'content_progress', 'exercises', 'habit_definitions', 'notification_settings', 'profiles', 'program_content', 'steps_log', 'user_walking_schedule', 'weight_log', 'workout_plan_days', 'workout_session_logs']) AS t
  WHERE to_regclass('public.' || t) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'חסרות טבלאות במסד הנתונים: %', array_to_string(missing, ', ')
      USING HINT = 'לא שונה כלום. שלחו את ההודעה הזו כמו שהיא.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_role')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_admin') THEN
    RAISE EXCEPTION 'חסרה הפונקציה public.has_role או public.is_admin'
      USING HINT = 'לא שונה כלום. שלחו את ההודעה הזו כמו שהיא.';
  END IF;
END $$;


-- #############################################################################
-- 0. בדיקה מקדימה (לא משנה כלום)
-- #############################################################################

-- בדיקה: 0. בדיקה מקדימה (לא משנה כלום)
SELECT '0' AS section, 'has_role קיימת' AS "check", (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_role')) AS ok
UNION ALL
SELECT '0' AS section, 'is_admin קיימת' AS "check", (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_admin')) AS ok
UNION ALL
SELECT '0' AS section, 'exercises קיימת' AS "check", (to_regclass('public.exercises') IS NOT NULL) AS ok
UNION ALL
SELECT '0' AS section, 'workout_plan_days קיימת' AS "check", (to_regclass('public.workout_plan_days') IS NOT NULL) AS ok
UNION ALL
SELECT '0' AS section, 'weight_log קיימת' AS "check", (to_regclass('public.weight_log') IS NOT NULL) AS ok;


-- #############################################################################
-- 0א. חבר מביא חבר: טבלת הבסיס (לא רצה מעולם)   (20260619000001_referrals.sql)
-- #############################################################################

-- Referral leads table: "חבר מביא חבר"
-- Safe to run more than once. (Admin access is replaced by a role-based
-- policy in 20261029000004.)
CREATE TABLE IF NOT EXISTS public.referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_name   TEXT NOT NULL,
  friend_phone  TEXT NOT NULL,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | contacted | converted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer ON public.referrals (referrer_id, created_at DESC);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can insert their own referrals
DROP POLICY IF EXISTS "users_insert_own_referrals" ON public.referrals;
CREATE POLICY "users_insert_own_referrals" ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_id = auth.uid());

-- Users can view their own referrals
DROP POLICY IF EXISTS "users_select_own_referrals" ON public.referrals;
CREATE POLICY "users_select_own_referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());

-- Admins: see 20261029000004 (by role, not by e-mail).

-- בדיקה: 0א. חבר מביא חבר: טבלת הבסיס (לא רצה מעולם)
SELECT '0א' AS section, 'referrals' AS "check", (to_regclass('public.referrals') IS NOT NULL) AS ok
UNION ALL
SELECT '0א' AS section, 'policy users_insert_own_referrals' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'users_insert_own_referrals')) AS ok;


-- #############################################################################
-- 0ב. מנהל רואה הליכות ואימונים   (20260621000001_admin_activity_log_policy.sql)
-- #############################################################################

-- Allow admin to read all users' activity_log entries (walks/workouts)
-- so that walk completions logged by users appear in the admin dashboard history.
DROP POLICY IF EXISTS "admins_select_all_activity_log" ON public.activity_log;
CREATE POLICY "admins_select_all_activity_log" ON public.activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND email = 'yairpwb@gmail.com'
    )
  );

-- בדיקה: 0ב. מנהל רואה הליכות ואימונים
SELECT '0ב' AS section, 'policy admins_select_all_activity_log' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_log' AND policyname = 'admins_select_all_activity_log')) AS ok;


-- #############################################################################
-- 0ג. מנהל מוחק שקילה   (20260831000001_admin_delete_weight_log.sql)
-- #############################################################################

-- Allow admins to delete individual weigh-in entries from the admin panel
-- (e.g. removing a mistaken entry a trainee logged). weight_log only had
-- SELECT access for admins; the existing "manage own" policy is USING-only
-- and scoped to auth.uid() = user_id, so it does not cover admins deleting
-- other users' rows.

DROP POLICY IF EXISTS "Admins can delete weight logs" ON public.weight_log;
CREATE POLICY "Admins can delete weight logs"
  ON public.weight_log FOR DELETE
  USING (public.is_admin());

-- בדיקה: 0ג. מנהל מוחק שקילה
SELECT '0ג' AS section, 'policy Admins can delete weight logs' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weight_log' AND policyname = 'Admins can delete weight logs')) AS ok;


-- #############################################################################
-- 0ד. תרגילי יד אחורית וכתפיים   (20260831000002_triceps_shoulders_exercises.sql)
-- #############################################################################

-- =====================================================
-- Add 10 gym strength exercises for triceps (יד אחורית)
-- and shoulders (כתפיים) — more variety per equipment type.
-- All GIFs from ExerciseDB OSS (static.exercisedb.dev)
-- =====================================================

-- Safe to run more than once: an exercise whose name already exists is skipped.
INSERT INTO public.exercises (name, description, muscle_groups, equipment, difficulty, media_url)
SELECT v.name, v.description, v.muscle_groups, v.equipment, v.difficulty, v.media_url
FROM (VALUES

-- ── TRICEPS ───────────────────────────────────────
(
  'פושדאון אחיזה הפוכה - כבל',
  'עמוד מול מכשיר הכבל עם ידית ישרה או מוט EZ, אחוז באחיזה תחתונה (כפות ידיים למעלה). מרפקים צמודים לגוף. דחף למטה עד הארכת מרפקים מלאה תוך שמירה על מרפקים קבועים במקום. הרחב לאט. אחיזה הפוכה מדגישה את הראש הארוך של הטריצפס.',
  ARRAY['טריצפס'],
  'cable',
  'intermediate',
  'https://static.exercisedb.dev/media/VjYliFZ.gif'
),
(
  'קיקבק - דמבל',
  'הנח ברך ויד על ספסל לתמיכה, בדומה לחתירה. אחוז דמבל ביד השנייה עם המרפק כפוף ב-90° וצמוד לגוף. פשוט את המרפק לאחור עד הארכת הזרוע המלאה תוך שמירה על הזרוע העליונה קבועה. הורד לאט. מבודד היטב את הטריצפס.',
  ARRAY['טריצפס'],
  'dumbbell',
  'beginner',
  'https://static.exercisedb.dev/media/W6PxUkg.gif'
),
(
  'פשיטת מרפקים מעל הראש בעמידה - מוט',
  'עמוד זקוף ואחוז מוט EZ או מוט רגיל מעל הראש בידיים ישרות, באחיזה צרה. הורד את המוט מאחורי הראש תוך כיפוף המרפקים בלבד. הרם בחזרה למעלה עד הארכת מלאה. שמור על מרפקים צמודים וקבועים לאורך כל התנועה. מתח טוב על הטריצפס בזווית מעל הראש.',
  ARRAY['טריצפס'],
  'barbell',
  'intermediate',
  'https://static.exercisedb.dev/media/dZl9Q27.gif'
),
(
  'פשיטת מרפקים - מכונה',
  'שב על מכשיר הטריצפס עם הזרועות על המשענת הייעודית. אחוז בידיות ודחוף למטה עד הארכת מרפקים מלאה. הרחב לאט לנקודת ההתחלה. המכונה מספקת תנועה מודרכת ובטוחה, מצוינת למתחילים או לעבודה בבידוד מלא.',
  ARRAY['טריצפס'],
  'machine',
  'beginner',
  'https://static.exercisedb.dev/media/Ser9eQp.gif'
),
(
  'פשיטת מרפקים מעל הראש - כבל (חבל)',
  'עמוד עם הגב למכשיר הכבל הנמוך, אחוז בחבל בשתי ידיים מעל הראש עם מרפקים כפופים. פשוט את המרפקים קדימה ולמעלה עד הארכת מלאה. הורד לאט תוך שמירה על מרפקים קבועים בגובה הראש. מותח את הטריצפס לאורך מלא בזווית שונה מפושדאון רגיל.',
  ARRAY['טריצפס'],
  'cable',
  'intermediate',
  'https://static.exercisedb.dev/media/2IxROQ1.gif'
),

-- ── SHOULDERS ─────────────────────────────────────
(
  'הרמות צד - כבל',
  'עמוד לצד מכשיר כבל נמוך, אחוז בידית ביד הרחוקה מהמכשיר. הרם את הזרוע לצד עד גובה הכתף תוך שמירה על קו קל במרפק. הורד לאט ובשליטה. הכבל שומר על מתח קבוע על הדלטואיד האמצעי לאורך כל הטווח, בשונה מדמבל.',
  ARRAY['כתפיים'],
  'cable',
  'intermediate',
  'https://static.exercisedb.dev/media/goJ6ezq.gif'
),
(
  'חתירה לכתפיים אחוריות - כבל (חבל)',
  'עמוד מול מכשיר כבל גבוה עם חבל. אחוז את קצות החבל בשתי ידיים ומשוך לכיוון הפנים תוך פתיחת המרפקים לצדדים וקירוב השכמות. שמור על גב ישר וגוף יציב. הורד לאט. מחזק את הדלטואיד האחורי ואת שרירי הגב העליון.',
  ARRAY['כתפיים אחוריות', 'גב עליון'],
  'cable',
  'intermediate',
  'https://static.exercisedb.dev/media/wqNPGCg.gif'
),
(
  'עמנואל בישיבה - דמבלים',
  'שב על ספסל עם משענת גב, אחוז דמבל בכל יד בגובה הכתפיים עם כפות ידיים פונות קדימה. דחף את הדמבלים ישר למעלה עד הארכת ידיים כמעט מלאה. הורד בשליטה לגובה הכתפיים. משענת הגב מסייעת ליציבות ומפחיתה מעורבות גב תחתון.',
  ARRAY['כתפיים', 'טריצפס'],
  'dumbbell',
  'beginner',
  'https://static.exercisedb.dev/media/znQUdHY.gif'
),
(
  'עמנואל - מכונה',
  'שב על מכשיר עמנואל עם גב צמוד למשענת. אחוז בידיות בגובה הכתפיים. דחף למעלה עד הארכת ידיים כמעט מלאה. הורד בשליטה חזרה. מכשיר יציב ובטוח לבניית כוח כתפיים ללא צורך באיזון עצמאי.',
  ARRAY['כתפיים', 'טריצפס'],
  'machine',
  'beginner',
  'https://static.exercisedb.dev/media/67n3r98.gif'
),
(
  'חתירה זקופה - מוט',
  'עמוד זקוף ואחוז מוט באחיזה צרה מול הירכיים. משוך את המוט למעלה לאורך הגוף עד גובה החזה העליון תוך הובלת המרפקים כלפי מעלה וכלפי חוץ. הורד לאט. מפעיל את הדלטואיד הצדדי ואת הטרפז העליון.',
  ARRAY['כתפיים', 'טרפז'],
  'barbell',
  'intermediate',
  'https://static.exercisedb.dev/media/UDlhcO8.gif'
)
) AS v(name, description, muscle_groups, equipment, difficulty, media_url)
WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.name = v.name);

-- בדיקה: 0ד. תרגילי יד אחורית וכתפיים
SELECT '0ד' AS section, 'התרגילים קיימים' AS "check", (EXISTS (SELECT 1 FROM public.exercises WHERE name = 'פושדאון אחיזה הפוכה - כבל')) AS ok;


-- #############################################################################
-- 1. סנכרון משקל נוכחי   (20261020000001_sync_current_weight_trigger.sql)
-- #############################################################################

-- Keep profiles.current_weight automatically in sync with weight_log via a
-- trigger, instead of relying on each client code path to update both tables
-- itself. This fixes two real bugs reported in production:
--
-- 1. A trainee logged a new weigh-in but current_weight in the system stayed
--    stale — traced to AppHome's quick weigh-in dialog, which inserted into
--    weight_log but never checked whether the follow-up profiles update
--    actually succeeded (so a silent failure there still showed "success").
-- 2. Deleting a weigh-in (from the app or the admin panel) only recomputed
--    current_weight client-side from the remaining rows already in memory,
--    which could pick the wrong row when two entries shared the same date,
--    and did nothing at all if the admin DELETE RLS policy wasn't live yet
--    (RLS silently filters instead of erroring, so the row never actually
--    deleted even though the client showed a success toast).
--
-- SECURITY DEFINER so the sync always succeeds regardless of which RLS
-- policy allowed the triggering insert/update/delete (trainee's own session
-- or an admin session).

CREATE OR REPLACE FUNCTION public.sync_current_weight()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user UUID := COALESCE(NEW.user_id, OLD.user_id);
  latest_weight NUMERIC;
BEGIN
  SELECT weight INTO latest_weight
  FROM public.weight_log
  WHERE user_id = affected_user
  ORDER BY recorded_at DESC, created_at DESC
  LIMIT 1;

  UPDATE public.profiles
  SET current_weight = latest_weight
  WHERE id = affected_user;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS weight_log_sync_current_weight ON public.weight_log;

CREATE TRIGGER weight_log_sync_current_weight
AFTER INSERT OR UPDATE OR DELETE ON public.weight_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_current_weight();

-- One-off backfill: fix any profile whose current_weight is already stale
-- relative to their actual latest weigh-in.
UPDATE public.profiles p
SET current_weight = latest.weight
FROM (
  SELECT DISTINCT ON (user_id) user_id, weight
  FROM public.weight_log
  ORDER BY user_id, recorded_at DESC, created_at DESC
) latest
WHERE p.id = latest.user_id
  AND p.current_weight IS DISTINCT FROM latest.weight;

-- בדיקה: 1. סנכרון משקל נוכחי
SELECT '1' AS section, 'trigger על weight_log' AS "check", (EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'weight_log_sync_current_weight' AND NOT tgisinternal)) AS ok;


-- #############################################################################
-- 2. סנכרון צעדים ברקע   (20261021000001_step_sync_tokens.sql)
-- #############################################################################

-- Background step sync without the user's login session.
--
-- The native background code (Android foreground service / iOS HealthKit
-- wake-ups) used to upload steps with the user's JWT access token, which
-- expires after ~1 hour — so every background upload silently failed unless
-- the app had been opened recently, and days the user didn't open the app
-- were never recorded. Instead, each device registers a long-lived random
-- sync token (only its SHA-256 hash is stored) and uploads through a
-- SECURITY DEFINER function that maps the token to its user.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.step_sync_devices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- No policies: the table is only reachable through the functions below.
ALTER TABLE public.step_sync_devices ENABLE ROW LEVEL SECURITY;

-- Called by the logged-in app once per device. Returns the plain token.
CREATE OR REPLACE FUNCTION public.register_step_sync_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.step_sync_devices (user_id, token_hash)
  VALUES (auth.uid(), encode(extensions.digest(v_token, 'sha256'), 'hex'));

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.register_step_sync_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_step_sync_token() TO authenticated;

-- Called from the background (anon key + token) and from the app itself.
-- p_entries: [{"date":"YYYY-MM-DD","steps":1234}, ...]
-- A day's count only ever goes up, so a stale/partial upload from one source
-- can never overwrite a higher count already recorded.
CREATE OR REPLACE FUNCTION public.sync_steps_with_token(p_token TEXT, p_entries JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash  TEXT := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_user  UUID;
  v_entry JSONB;
  v_date  DATE;
  v_steps INT;
  v_count INT := 0;
BEGIN
  SELECT user_id INTO v_user FROM public.step_sync_devices WHERE token_hash = v_hash;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'invalid sync token' USING ERRCODE = '28000';
  END IF;

  UPDATE public.step_sync_devices SET last_used_at = now() WHERE token_hash = v_hash;

  IF jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) > 60 THEN
    RETURN 0;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    BEGIN
      v_date  := (v_entry->>'date')::DATE;
      v_steps := (v_entry->>'steps')::INT;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    CONTINUE WHEN v_date IS NULL OR v_steps IS NULL;
    CONTINUE WHEN v_steps < 0 OR v_steps > 200000;
    CONTINUE WHEN v_date > current_date + 1 OR v_date < current_date - 30;

    INSERT INTO public.steps_log (user_id, date, steps, updated_at)
    VALUES (v_user, v_date, v_steps, now())
    ON CONFLICT (user_id, date) DO UPDATE
      SET steps      = GREATEST(public.steps_log.steps, EXCLUDED.steps),
          updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_steps_with_token(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_steps_with_token(TEXT, JSONB) TO anon, authenticated;

-- בדיקה: 2. סנכרון צעדים ברקע
SELECT '2' AS section, 'step_sync_devices' AS "check", (to_regclass('public.step_sync_devices') IS NOT NULL) AS ok
UNION ALL
SELECT '2' AS section, 'sync_steps_with_token' AS "check", (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'sync_steps_with_token')) AS ok;


-- #############################################################################
-- 3. שאלון פתיחה   (20261029000001_onboarding.sql)
-- #############################################################################

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

-- בדיקה: 3. שאלון פתיחה
SELECT '3' AS section, 'onboarding_responses' AS "check", (to_regclass('public.onboarding_responses') IS NOT NULL) AS ok
UNION ALL
SELECT '3' AS section, 'body_measurements' AS "check", (to_regclass('public.body_measurements') IS NOT NULL) AS ok
UNION ALL
SELECT '3' AS section, 'body_photos' AS "check", (to_regclass('public.body_photos') IS NOT NULL) AS ok
UNION ALL
SELECT '3' AS section, 'profiles.age' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'age')) AS ok
UNION ALL
SELECT '3' AS section, 'bucket body-photos' AS "check", (EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'body-photos')) AS ok;


-- #############################################################################
-- 4. צלחת ויומן אישי   (20261029000002_home_plate_calendar.sql)
-- #############################################################################

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

-- בדיקה: 4. צלחת ויומן אישי
SELECT '4' AS section, 'habit_definitions.plate_zone' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habit_definitions' AND column_name = 'plate_zone')) AS ok
UNION ALL
SELECT '4' AS section, 'calendar_events' AS "check", (to_regclass('public.calendar_events') IS NOT NULL) AS ok;


-- #############################################################################
-- 5. אימונים מהשעון   (20261029000003_watch_workouts.sql)
-- #############################################################################

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

-- בדיקה: 5. אימונים מהשעון
SELECT '5' AS section, 'external_workouts' AS "check", (to_regclass('public.external_workouts') IS NOT NULL) AS ok;


-- #############################################################################
-- 6. פרופיל, הגדרות, חבר מביא חבר   (20261029000004_profile_settings_referrals.sql)
-- #############################################################################

-- Profile / settings / referral redesign.

-- ── 1. Personal referral code ────────────────────────────────────────────────
-- 6 characters, no look-alikes (0/O, 1/I/L), unique per trainee.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code TEXT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;

UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

ALTER TABLE public.profiles ALTER COLUMN referral_code SET DEFAULT public.generate_referral_code();
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);

-- ── 2. Referral status + consent ─────────────────────────────────────────────
-- status keeps its existing values; the app shows them as
--   pending → "נשלח", contacted → "בשיחה", converted → "הצטרף".
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS friend_knows BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'form' CHECK (source IN ('form', 'link'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_status_check') THEN
    ALTER TABLE public.referrals
      -- NOT VALID: checks new rows without failing on any older value already stored.
      ADD CONSTRAINT referrals_status_check CHECK (status IN ('pending', 'contacted', 'converted')) NOT VALID;
  END IF;
END $$;

-- Admin access by role, not by a hard-coded e-mail address.
DROP POLICY IF EXISTS "admins_select_all_referrals" ON public.referrals;
DROP POLICY IF EXISTS "admins_manage_all_referrals" ON public.referrals;
CREATE POLICY "admins_manage_all_referrals" ON public.referrals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── 3. Per-type notification preferences ─────────────────────────────────────
-- Missing keys mean "on". Keys: habits, weigh, workout_walk, weekly_summary, new_content.
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS prefs               JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS habit_reminder_time TIME  NOT NULL DEFAULT '20:00';

-- ── 4. Links shown in settings / referral (empty → row hidden) ──────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('public_site_url', ''),
  ('privacy_policy_url', ''),
  ('terms_url', ''),
  ('support_whatsapp_url', 'https://wa.me/message/IZV5KBE6SSC7B'),
  ('referral_reward', '500 ₪ וחודש ליווי מתנה')
ON CONFLICT (key) DO NOTHING;

-- בדיקה: 6. פרופיל, הגדרות, חבר מביא חבר
SELECT '6' AS section, 'profiles.referral_code' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referral_code')) AS ok
UNION ALL
SELECT '6' AS section, 'referrals.friend_knows' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'friend_knows')) AS ok
UNION ALL
SELECT '6' AS section, 'notification_settings.prefs' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_settings' AND column_name = 'prefs')) AS ok
UNION ALL
SELECT '6' AS section, 'policy admins_manage_all_referrals' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'admins_manage_all_referrals')) AS ok;


-- #############################################################################
-- 7. שולחן הבית, סטים באימון, מקור סימון   (20261030000001_table_and_workout_sets.sql)
-- #############################################################################

-- Home table illustration + workout set logging + walk status.
--
-- 1. habit_definitions.visual_key — which object on the table (or which question in
--    the daily summary) a habit is drawn as. NULL = tag only.
-- 2. workout_set_logs — every set is saved the moment it's marked done, and
--    kept after the 10-session cap so "last time" always has a source.
-- 3. workout_session_logs — link to the sets, difficulty, totals.
-- 4. activity_log.source — how a walk/workout got marked (incl. late).

-- ── 1. visual_key ────────────────────────────────────────────────────────────
ALTER TABLE public.habit_definitions
  ADD COLUMN IF NOT EXISTS visual_key TEXT
    CHECK (visual_key IN (
      'water_before_meal', 'plate_thirds', 'plate_veggies', 'one_plate', 'one_sauce',
      'slow_eating', 'olive_oil', 'fruit_snack', 'water_before_snack', 'meals_4',
      'routine_wake_eat', 'routine_stop_eating', 'routine_sleep',
      'no_sweet_drinks', 'coffee_sugar'
    ));

COMMENT ON COLUMN public.habit_definitions.visual_key IS
  'Object on the home-screen table (or routine row) this habit is drawn as. NULL = shown as a tag only.';

-- Best-effort backfill from the habit names; admins can correct any row.
UPDATE public.habit_definitions SET visual_key = CASE
  WHEN name ILIKE '%2 כוסות%' OR name ILIKE '%שתי כוסות%'                      THEN 'water_before_meal'
  WHEN name ILIKE '%כוס מים%' AND (name ILIKE '%נשנוש%' OR name ILIKE '%מתוק%') THEN 'water_before_snack'
  WHEN name ILIKE '%סוכר%'                                                    THEN 'coffee_sugar'
  WHEN name ILIKE '%מתוק%' OR name ILIKE '%ממותק%'                            THEN 'no_sweet_drinks'
  WHEN name ILIKE '%שליש%'                                                    THEN 'plate_thirds'
  WHEN name ILIKE '%ירק%'                                                     THEN 'plate_veggies'
  WHEN name ILIKE '%צלחת אחת%'                                                THEN 'one_plate'
  WHEN name ILIKE '%רוטב%'                                                    THEN 'one_sauce'
  WHEN name ILIKE '%איטית%'                                                   THEN 'slow_eating'
  WHEN name ILIKE '%שמן%'                                                     THEN 'olive_oil'
  WHEN name ILIKE '%פרי%' OR name ILIKE '%מאכלים בריאים%'                     THEN 'fruit_snack'
  WHEN name ILIKE '%ארוחות גדולות%' OR name ILIKE '%2 ארוחות%'                THEN 'meals_4'
  WHEN name ILIKE '%קימה%' OR name ILIKE '%אחרי שקמים%'                       THEN 'routine_wake_eat'
  WHEN name ILIKE '%להפסיק לאכול%' OR name ILIKE '%לפני השינה%'               THEN 'routine_stop_eating'
  WHEN name ILIKE '%שינה%'                                                    THEN 'routine_sleep'
  ELSE NULL
END
WHERE visual_key IS NULL;

-- ── 2. workout_set_logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_set_logs (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Generated by the app when the workout starts; ties the sets of one workout together.
  client_session_id UUID         NOT NULL,
  plan_day_id       UUID         REFERENCES public.workout_plan_days(id) ON DELETE SET NULL,
  exercise_id       UUID         NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  set_number        INT          NOT NULL CHECK (set_number >= 1),
  reps              INT,
  weight_kg         NUMERIC(6,2),
  reps_max_target   INT,
  logged_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (client_session_id, exercise_id, set_number)
);

CREATE INDEX IF NOT EXISTS workout_set_logs_user_exercise_idx
  ON public.workout_set_logs (user_id, exercise_id, logged_at DESC);

ALTER TABLE public.workout_set_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own sets" ON public.workout_set_logs;
CREATE POLICY "Trainee manages own sets"
  ON public.workout_set_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read sets" ON public.workout_set_logs;
CREATE POLICY "Admins read sets"
  ON public.workout_set_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ── 3. workout_session_logs ──────────────────────────────────────────────────
ALTER TABLE public.workout_session_logs
  ADD COLUMN IF NOT EXISTS client_session_id UUID,
  ADD COLUMN IF NOT EXISTS difficulty        TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  ADD COLUMN IF NOT EXISTS sets_done         INT,
  ADD COLUMN IF NOT EXISTS total_volume_kg   NUMERIC(10,2);

-- ── 4. activity_log.source ───────────────────────────────────────────────────
ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'late', 'health', 'watch'));

COMMENT ON COLUMN public.activity_log.source IS
  'manual = marked on the day, late = marked afterwards for a past day, health/watch = confirmed from a health/watch workout.';

-- בדיקה: 7. שולחן הבית, סטים באימון, מקור סימון
SELECT '7' AS section, 'habit_definitions.visual_key' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habit_definitions' AND column_name = 'visual_key')) AS ok
UNION ALL
SELECT '7' AS section, 'workout_set_logs' AS "check", (to_regclass('public.workout_set_logs') IS NOT NULL) AS ok
UNION ALL
SELECT '7' AS section, 'workout_session_logs.difficulty' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workout_session_logs' AND column_name = 'difficulty')) AS ok
UNION ALL
SELECT '7' AS section, 'activity_log.source' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activity_log' AND column_name = 'source')) AS ok;


-- #############################################################################
-- 8. סיכום יומי ושעות שינה   (20261030000002_daily_summary_sleep.sql)
-- #############################################################################

-- Daily summary (replaces the weekly survey), sleep hours, slow-eating retired.
-- Run after 20261030000001_table_and_workout_sets.sql.
--
-- 1. profiles.sleep_time / wake_time — the trainee's sleep hours (Settings).
--    NULL = not set yet; the app falls back to the intake questionnaire.
-- 2. daily_summaries — one row per trainee per day, answered around bedtime.
--    Each habit answer is keyed by habit_id; "yes" answers are also written to
--    daily_habits_log by the app so they count for streaks and perfect days.
-- 3. checkin_questions — the weekly survey is switched off (rows and answers kept).
-- 4. "אכילה איטית" is hidden from every stage (day_end = 0). Its rows and the
--    trainees' past ticks stay, so history doesn't change.

-- ── 1. Sleep hours ───────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sleep_time TIME,
  ADD COLUMN IF NOT EXISTS wake_time  TIME;

COMMENT ON COLUMN public.profiles.sleep_time IS 'Bedtime (local). Drives the daily summary window, night mode and quiet hours for push.';
COMMENT ON COLUMN public.profiles.wake_time  IS 'Wake-up time (local). End of night mode / quiet hours.';

-- ── 2. daily_summaries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_summaries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date  DATE        NOT NULL,
  -- { "<habit_id>": "yes" | "partial" | "no" }
  answers       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Thursday only (weekly check-in questions), 1–5
  energy        SMALLINT    CHECK (energy BETWEEN 1 AND 5),
  hunger        SMALLINT    CHECK (hunger BETWEEN 1 AND 5),
  proud_of      TEXT,
  -- Habits done that day (table + summary) when it was sent — for the admin view.
  habits_done   INT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, summary_date)
);

ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainee manages own summaries" ON public.daily_summaries;
CREATE POLICY "Trainee manages own summaries"
  ON public.daily_summaries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read summaries" ON public.daily_summaries;
CREATE POLICY "Admins read summaries"
  ON public.daily_summaries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ── 3. Weekly survey off ─────────────────────────────────────────────────────
UPDATE public.checkin_questions SET is_active = false;

-- ── 4. Slow eating hidden ────────────────────────────────────────────────────
UPDATE public.habit_definitions
SET day_end = 0
WHERE visual_key = 'slow_eating' OR name ILIKE '%אכילה איטית%';

-- בדיקה: 8. סיכום יומי ושעות שינה
SELECT '8' AS section, 'profiles.sleep_time' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'sleep_time')) AS ok
UNION ALL
SELECT '8' AS section, 'daily_summaries' AS "check", (to_regclass('public.daily_summaries') IS NOT NULL) AS ok
UNION ALL
SELECT '8' AS section, 'השאלון השבועי כבוי' AS "check", (NOT EXISTS (SELECT 1 FROM public.checkin_questions WHERE is_active)) AS ok;


-- #############################################################################
-- 9. דף התכנים: חלקים ומשך   (20261030000003_content_parts_duration.sql)
-- #############################################################################

-- Content page redesign: a name (and optional subtitle) per program part, and
-- a length per content item. Both are optional — the app falls back to
-- "חלק N", a subtitle worked out from the unlock days, and no duration.

-- ── Per-item duration ────────────────────────────────────────────────────────
ALTER TABLE public.program_content
  ADD COLUMN IF NOT EXISTS duration_minutes INT CHECK (duration_minutes > 0);

COMMENT ON COLUMN public.program_content.duration_minutes IS
  'Approximate length in minutes ("4 דק''" on the content map). NULL = not shown.';

-- ── Program parts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.program_parts (
  part_number INT  PRIMARY KEY,
  -- "בניית הבסיס" → shown as "חלק 2 · בניית הבסיס"
  name        TEXT,
  -- e.g. "שבועות 5–12 · תוכן חדש כל שבועיים"; NULL = worked out from the unlock days
  subtitle    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read parts" ON public.program_parts;
CREATE POLICY "Authenticated users read parts"
  ON public.program_parts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage parts" ON public.program_parts;
CREATE POLICY "Admins manage parts"
  ON public.program_parts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- One row per part that has content; names to be filled in by the admin.
INSERT INTO public.program_parts (part_number, name)
SELECT DISTINCT part_number, CASE WHEN part_number = 5 THEN 'הבסיס לשינוי הרגלים' END
FROM public.program_content
ON CONFLICT (part_number) DO NOTHING;

-- בדיקה: 9. דף התכנים: חלקים ומשך
SELECT '9' AS section, 'program_content.duration_minutes' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'program_content' AND column_name = 'duration_minutes')) AS ok
UNION ALL
SELECT '9' AS section, 'program_parts' AS "check", (to_regclass('public.program_parts') IS NOT NULL) AS ok;


-- #############################################################################
-- 10. נושא למדריכים   (20261031000001_content_category.sql)
-- #############################################################################

-- Guide topics for the guides library (תזונה / אירועים ויציאות / אימונים / שינה ושגרה).
-- Optional: until this runs, the app infers the topic from the guide's title.

ALTER TABLE public.program_content
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN ('nutrition', 'events', 'training', 'sleep'));

COMMENT ON COLUMN public.program_content.category IS
  'Guide topic for the guides library; NULL = inferred from the title.';

-- Best-effort backfill for existing guides; admins can correct any row.
UPDATE public.program_content SET category = CASE
  WHEN title ~ '(מסעד|אירוע|חו"ל|חו״ל|טיסה|נופש|חופש|יציא|מסיב|חג)' THEN 'events'
  WHEN title ~ '(אימון|כוח|הליכ|ריצ|כושר)'                         THEN 'training'
  WHEN title ~ '(שינה|שגרה|בוקר|לילה|קימה)'                        THEN 'sleep'
  ELSE 'nutrition'
END
WHERE content_type = 'guide' AND category IS NULL;

-- בדיקה: 10. נושא למדריכים
SELECT '10' AS section, 'program_content.category' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'program_content' AND column_name = 'category')) AS ok;


-- #############################################################################
-- 11. פעילויות, מסלולים, האימונים שלי   (20261031000002_activities.sql)
-- #############################################################################

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

-- בדיקה: 11. פעילויות, מסלולים, האימונים שלי
SELECT '11' AS section, 'activities' AS "check", (to_regclass('public.activities') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'activity_tracks' AS "check", (to_regclass('public.activity_tracks') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'my_workouts' AS "check", (to_regclass('public.my_workouts') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'my_workout_exercises' AS "check", (to_regclass('public.my_workout_exercises') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'trigger day לפי ישראל' AS "check", (EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'activities_set_day' AND NOT tgisinternal)) AS ok
UNION ALL
SELECT '11' AS section, 'מסלולים: אין גישת מנהל' AS "check", (NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_tracks' AND policyname ILIKE '%admin%')) AS ok
UNION ALL
SELECT '11' AS section, 'לא נשארו הערות JSON ידניות' AS "check", (NOT EXISTS (SELECT 1 FROM public.workout_session_logs WHERE CASE WHEN pg_input_is_valid(notes, 'jsonb') THEN notes::jsonb->>'source' = 'manual' ELSE false END)) AS ok;


-- #############################################################################
-- 12. חלון אכילה וסידור ארוחות ביומן   (20261031000003_habit_schedule_rules.sql)
-- #############################################################################

-- Habits that have a time of day show up in the calendar (eating window,
-- meal layout). The rule lives on the habit row, so a stage change is a data
-- change (day_start / day_end), never a number in the app's code.
-- Safe to run more than once.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
-- Shapes:
--   {"anchor": "wake" | "sleep", "offset_minutes": 180, "label": "מתחילים לאכול"}
--   {"type": "meals", "meals": [{"key", "label", "size": "big"|"small", "optional"?, "explanation"?}]}
ALTER TABLE public.habit_definitions
  ADD COLUMN IF NOT EXISTS schedule_rule JSONB;

COMMENT ON COLUMN public.habit_definitions.schedule_rule IS
  'Time-of-day rule for the calendar: an anchor (wake/sleep) + offset, or a meal layout. NULL = not in the calendar.';

-- The trainee's own meal times ({"brunch": "10:30", ...}); meals not listed follow the recommended times.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS meal_times JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. Eating window (from day 8) ────────────────────────────────────────────
UPDATE public.habit_definitions
SET schedule_rule = '{"anchor": "wake", "offset_minutes": 180, "label": "מתחילים לאכול"}'::jsonb
WHERE id = '556ad539-6a86-4094-bbba-2ba4afb3dada';   -- להתחיל לאכול 3 שעות לאחר הקימה

-- "One hour before bed" runs until day 105; from day 106 (week 16) it's two hours.
UPDATE public.habit_definitions
SET schedule_rule = '{"anchor": "sleep", "offset_minutes": -60, "label": "מפסיקים לאכול"}'::jsonb,
    day_end = 105
WHERE id = '85c1ebdf-6aca-45bb-b64a-6166ab9dc5ff';   -- להפסיק לאכול שעה לפני השינה

INSERT INTO public.habit_definitions (name, icon, is_bonus, week_start, day_start, day_end, explanation, plate_zone, visual_key, schedule_rule)
SELECT 'להפסיק לאכול שעתיים לפני השינה', 'moon', false, 16, 106, NULL,
       'סוגרים את המטבח שעתיים לפני השינה – שינה טובה יותר ופחות נשנושי לילה',
       'side', 'routine_stop_eating',
       '{"anchor": "sleep", "offset_minutes": -120, "label": "מפסיקים לאכול"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'להפסיק לאכול שעתיים לפני השינה' AND user_id IS NULL);

-- ── 3. Meal layout ───────────────────────────────────────────────────────────
-- Four meals from day 36 (the existing habit) until day 224…
UPDATE public.habit_definitions
SET schedule_rule = '{"type": "meals", "meals": [
      {"key": "brunch", "label": "ארוחת בוקר-צהריים", "size": "big",   "explanation": "הארוחה הגדולה הראשונה – פותחת את חלון האכילה"},
      {"key": "snack",  "label": "ארוחת ביניים",      "size": "small", "explanation": "ארוחה קטנה באמצע היום, שלא נגיע רעבים לערב"},
      {"key": "sweet",  "label": "ארוחה מתוקה",       "size": "small", "explanation": "כאן נכנס המתוק של היום, בלי רגשות אשם"},
      {"key": "dinner", "label": "ארוחת ערב",         "size": "big",   "explanation": "הארוחה הגדולה השנייה – ואחריה המטבח נסגר"}
    ]}'::jsonb,
    day_end = 224
WHERE id = '1f869ea4-2786-4e3c-ba9a-c54646789ecc';   -- לאכול 2 ארוחות גדולות ו2 קטנות

-- …then two meals a day from day 225 (week 33), plus one optional small meal.
INSERT INTO public.habit_definitions (name, icon, is_bonus, week_start, day_start, day_end, explanation, plate_zone, visual_key, schedule_rule)
SELECT 'שתי ארוחות ביום', 'star', false, 33, 225, NULL,
       'שתי ארוחות גדולות ביום, וארוחה קטנה רק אם צריך',
       'side', 'meals_4',
       '{"type": "meals", "meals": [
          {"key": "brunch", "label": "ארוחת בוקר-צהריים", "size": "big",   "explanation": "הארוחה הגדולה הראשונה – פותחת את חלון האכילה"},
          {"key": "small",  "label": "ארוחה קטנה",        "size": "small", "optional": true, "explanation": "רק אם רעבים – לא חובה"},
          {"key": "dinner", "label": "ארוחת ערב",         "size": "big",   "explanation": "הארוחה הגדולה השנייה – ואחריה המטבח נסגר"}
        ]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'שתי ארוחות ביום' AND user_id IS NULL);

-- בדיקה: 12. חלון אכילה וסידור ארוחות ביומן
SELECT '12' AS section, 'habit_definitions.schedule_rule' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habit_definitions' AND column_name = 'schedule_rule')) AS ok
UNION ALL
SELECT '12' AS section, 'profiles.meal_times' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'meal_times')) AS ok
UNION ALL
SELECT '12' AS section, '"שעה לפני השינה" עד יום 105' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE id = '85c1ebdf-6aca-45bb-b64a-6166ab9dc5ff' AND day_end = 105 AND schedule_rule IS NOT NULL)) AS ok
UNION ALL
SELECT '12' AS section, '"שעתיים לפני השינה" מיום 106' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'להפסיק לאכול שעתיים לפני השינה' AND day_start = 106 AND schedule_rule IS NOT NULL)) AS ok
UNION ALL
SELECT '12' AS section, '4 ארוחות עד יום 224' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE id = '1f869ea4-2786-4e3c-ba9a-c54646789ecc' AND day_end = 224 AND schedule_rule->>'type' = 'meals')) AS ok
UNION ALL
SELECT '12' AS section, '"שתי ארוחות ביום" מיום 225' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'שתי ארוחות ביום' AND day_start = 225)) AS ok;


-- #############################################################################
-- 13. שעות של אימון, הליכה וארוחות שהמתאמן הזיז   (20261031000004_calendar_placements.sql)
-- #############################################################################

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

-- בדיקה: 13. שעות של אימון, הליכה וארוחות שהמתאמן הזיז
SELECT '13' AS section, 'calendar_placements' AS "check", (to_regclass('public.calendar_placements') IS NOT NULL) AS ok
UNION ALL
SELECT '13' AS section, 'policy Trainee manages own placements' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_placements' AND policyname = 'Trainee manages own placements')) AS ok
UNION ALL
SELECT '13' AS section, 'calendar_placements.valid_from' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_placements' AND column_name = 'valid_from')) AS ok;


-- #############################################################################
-- 14. אירועים חוזרים ביומן   (20261031000005_calendar_recurrence.sql)
-- #############################################################################

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

-- בדיקה: 14. אירועים חוזרים ביומן
SELECT '14' AS section, 'calendar_events.repeat_rule' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'repeat_rule')) AS ok
UNION ALL
SELECT '14' AS section, 'calendar_events.excluded_days' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'excluded_days')) AS ok
UNION ALL
SELECT '14' AS section, 'calendar_events.parent_id' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'parent_id')) AS ok
UNION ALL
SELECT '14' AS section, 'עד 7 הליכות בשבוע' AS "check", (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_walking_schedule_walk_number_check' AND pg_get_constraintdef(oid) LIKE '%7%')) AS ok;


-- #############################################################################
-- 15. תוכנית v2: תכנים והרגלים מחדש   (20261101000001_program_v2.sql)
-- #############################################################################

-- Program v2: the content list and habits rebuilt from the program outline.
--
-- Days: day 1 = the trainee's start, always a Saturday. A week's content
-- opens on its Saturday (7·(week−1)+1); its habits start the next day, the
-- Sunday (content day + 1).
--
-- Nothing is deleted: deleting would cascade away trainees' history
-- (content_progress, daily_habits_log). Old content is archived
-- (archived_at), old habits are retired with day_end = 0 (hidden, ticks kept).
-- Safe to run more than once: rows are matched by title / name and set to
-- the values below.

-- ── 0. Archive flag for content ───────────────────────────────────────────────
ALTER TABLE public.program_content ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
COMMENT ON COLUMN public.program_content.archived_at IS 'Set = replaced in a program revision; hidden from trainees, progress kept.';

-- ── 1. Parts ─────────────────────────────────────────────────────────────────
INSERT INTO public.program_parts (part_number, name, subtitle) VALUES
  (1, 'בניית הבסיס',          'שבועות 1–4 · סרטון כל שבוע'),
  (2, 'מוסיפים ומשפרים',      'שבועות 5–12 · סרטון כל שבועיים'),
  (3, 'מדייקים את ההרגלים',   'שבועות 13–24 · סרטון כל 3 שבועות'),
  (4, 'המאמנים של עצמכם',     'שבועות 25–36 · סרטון כל 4 שבועות')
ON CONFLICT (part_number) DO UPDATE SET name = EXCLUDED.name, subtitle = EXCLUDED.subtitle;

-- ── 2. Content ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS v2_content;
CREATE TEMP TABLE v2_content (
  sort_order INT, part_number INT, week_range TEXT, unlock_day INT,
  content_type TEXT, is_bonus BOOLEAN, title TEXT, description TEXT, category TEXT
);

INSERT INTO v2_content VALUES
  -- Part 1 · a video every week
  (10, 1, 'פתיחה', 1, 'video', false, 'ברוכים הבאים: סוויץ'' במוח', 'איך עובד התהליך, ולמה הפעם זה יעבוד.', NULL),
  (11, 1, 'פתיחה', 1, 'guide', false, 'מדריך: איך להישקל', 'מתי, איך ובאיזו תדירות שוקלים, ולמה המשקל קופץ.', 'nutrition'),
  (12, 1, 'פתיחה', 1, 'guide', false, 'ספר הנשנושים', 'נשנושים טובים שאפשר להכין ולקנות.', 'nutrition'),
  (13, 1, 'פתיחה', 1, 'guide', false, 'מדריך: אני חולה, מה עושים?', 'איך שומרים על ההרגלים כשלא מרגישים טוב.', 'sleep'),
  (14, 1, 'פתיחה', 1, 'video', true,  'סרטון העשרה: צימוד הרגלים', 'לוקחים הרגל קיים ומצמידים אליו הרגל טוב.', NULL),
  (20, 1, 'שבוע 1', 1, 'video', false, 'שבוע 1: מים לפני האוכל והליכה ראשונה',
      '2 כוסות מים לפני ארוחה גדולה · כוס מים לפני ארוחה קטנה, נשנוש או מתוק · הליכה פעם בשבוע, 20–30 דקות (מסמנים באפליקציה את יום ההליכה).', NULL),
  (30, 1, 'שבוע 2', 8, 'video', false, 'שבוע 2: חלון האכילה וירקות בכל ארוחה',
      'מתחילים לאכול 3 שעות אחרי הקימה · מפסיקים לאכול שעה לפני השינה · ירקות בכל ארוחה, בעיקר בגדולות.', NULL),
  (31, 1, 'שבוע 2', 8, 'video', true,  'סרטון העשרה: העלאת זמינות', 'מקלים על הטוב ומקשים על הרע — למשל ירקות מול העיניים.', NULL),
  (40, 1, 'שבוע 3', 15, 'video', false, 'שבוע 3: שמן זית, שתייה מתוקה ושינה',
      'שמן זית במקום קנולה, ושמים לב לכמות · שתייה מתוקה: כוס אחת, בקפה חצי מהסוכר · שינה: השעות של היום + 8, חלקי 2 — חדר קר, חושך, בלי מסכים, שעה קבועה.', NULL),
  (50, 1, 'שבוע 4', 22, 'video', false, 'שבוע 4: צלחת אחת, רוטב אחד ו-2 הליכות',
      '2 הליכות בשבוע · אוכלים בצלחת אחת, בלי ריפילים או נשנושים מהצד · רוטב אחד לכל ארוחה.', NULL),
  -- Part 2 · a video every two weeks
  (60, 2, 'שבועות 5–6', 29, 'video', false, 'חלק 2: סידור ארוחות, אימון וחלבון',
      'סידור ארוחות: 2 גדולות, ביניים ומתוקה · אימון אחד בשבוע · חלבון בכל ארוחה.', NULL),
  (61, 2, 'שבועות 5–6', 29, 'guide', false, 'מדריך: ארוחות שישי, מסעדות ואירועים', 'איך נהנים בלי לצאת מהמסלול.', 'events'),
  (62, 2, 'שבועות 5–6', 29, 'guide', false, 'מדריך: רגעים לא צפויים', 'מה עושים כשהתוכנית משתבשת.', 'events'),
  (70, 2, 'שבועות 7–8', 43, 'video', false, 'שבועות 7–8: צעדים ומים',
      '6,000 צעדים ביום בממוצע · 2 עד 3 ליטר מים ביום.', NULL),
  (71, 2, 'שבועות 7–8', 43, 'guide', false, 'מדריך: העלאת צעדים', 'דרכים פשוטות להוסיף צעדים ליום.', 'training'),
  (80, 2, 'שבועות 9–10', 57, 'video', false, 'שבועות 9–10: אימונים, זירו ופירות',
      '2 עד 3 אימונים בשבוע · זירו במקום משקאות מתוקים · פירות במקום נשנושים ושוקולדים.', NULL),
  (81, 2, 'שבועות 9–10', 57, 'guide', false, 'מדריך: למקסם את האימון', 'איך מוציאים יותר מכל אימון.', 'training'),
  (82, 2, 'שבועות 9–10', 57, 'video', true,  'סרטון העשרה: אדפטציה מטבולית', 'למה המשקל נתקע, ומה עושים: העמסת פחמימות או Reverse Diet.', NULL),
  (90, 2, 'שבועות 11–12', 71, 'video', false, 'שבועות 11–12: הצלחת המחולקת ודילול',
      'לחלק את הצלחת לשליש חלבון / פחמימה / ירק · בחירת רוטב אחד פעם אחת ביום · דילול מאכלים עתירי קלוריות 80%.', NULL),
  (91, 2, 'שבועות 11–12', 71, 'guide', false, 'מדריך: תזונה בריאה', 'עקרונות לאוכל בריא בלי תפריט.', 'nutrition'),
  (92, 2, 'שבועות 11–12', 71, 'guide', false, 'מדריך: רשימת קניות', 'מה שמים בעגלה כדי שיהיה קל לאכול טוב.', 'nutrition'),
  -- Part 3 · a video every three weeks
  (100, 3, 'שבועות 13–15', 85, 'video', false, 'חלק 3: משפרים את מה שכבר קיים',
      'מי שעוד לא רואה תוצאה, זה הזמן להתחיל להקפיד. 8,000 צעדים ביום בממוצע · בלי סוכר בקפה.', NULL),
  (110, 3, 'שבועות 16–18', 106, 'video', false, 'שבועות 16–18: שעתיים לפני השינה',
      'מפסיקים לאכול שעתיים לפני השינה · משפרים את שעות השינה לפי הנוסחה.', NULL),
  (120, 3, 'שבועות 19–21', 127, 'video', false, 'שבועות 19–21: 90% בריא ורשימת רכיבים',
      '90% מהזמן אוכלים בריא · בודקים את רשימת הרכיבים במוצרים.', NULL),
  (130, 3, 'שבועות 22–24', 148, 'video', false, 'שבועות 22–24: חלבון לפי משקל',
      '2 גרם חלבון לכל קילו משקל גוף.', NULL),
  -- Part 4 · a video every four weeks
  (140, 4, 'שבועות 25–28', 169, 'video', false, 'חלק 4: המאמנים של עצמכם',
      'עוד כלים לאורח חיים בריא, ולומדים לבנות תוכניות לעצמכם. מדרגים כל הרגל באחוזים · משפרים את ההרגל החלש עד 100% · מתעדפים את אורח החיים בלו"ז.', NULL),
  (150, 4, 'שבועות 29–32', 197, 'video', false, 'שבועות 29–32: בונים אימונים לבד', 'קוראים את המסמך של בניית האימונים.', NULL),
  (151, 4, 'שבועות 29–32', 197, 'guide', false, 'מסמך בניית האימונים', 'איך בונים לעצמכם תוכנית אימונים.', 'training'),
  (160, 4, 'שבועות 33–36', 225, 'video', false, 'שבועות 33–36: 2 ארוחות ויותר מים',
      '2 ארוחות גדולות ביום · 2.5 עד 3.5 ליטר מים ביום.', NULL);

-- Old content that isn't in the new list: archived (progress kept).
UPDATE public.program_content c
SET archived_at = now()
WHERE c.archived_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM v2_content v WHERE v.title = c.title);

-- New rows that don't exist yet…
INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order, category)
SELECT v.part_number, v.week_range, v.unlock_day, v.title, v.description, v.content_type, v.is_bonus, v.sort_order, v.category
FROM v2_content v
WHERE NOT EXISTS (SELECT 1 FROM public.program_content c WHERE c.title = v.title);

-- …and every row of the list set to exactly these values (also un-archived).
UPDATE public.program_content c
SET part_number = v.part_number, week_range = v.week_range, unlock_day = v.unlock_day,
    description = v.description, content_type = v.content_type, is_bonus = v.is_bonus,
    sort_order = v.sort_order, category = v.category, archived_at = NULL
FROM v2_content v
WHERE c.title = v.title;

-- Video / file links carried over from archived items on the same subject
-- (only where the new item has none yet). Anything missing: add in the dashboard.
WITH links(new_pattern, old_pattern) AS (VALUES
  ('ברוכים הבאים%', '%ברוכים הבאים%'),
  ('%להישקל%', '%שקיל%'),
  ('ספר הנשנושים', '%נשנוש%'),
  ('%אני חולה%', '%חולה%'),
  ('%צימוד הרגלים%', '%צימוד%'),
  ('%העלאת זמינות%', '%זמינות%'),
  ('%אדפטציה מטבולית%', '%אדפטציה%'),
  ('%מסעדות ואירועים%', '%מסעד%'),
  ('%רגעים לא צפויים%', '%לא צפוי%'),
  ('%העלאת צעדים%', '%צעדים%'),
  ('%למקסם את האימון%', '%למקסם%'),
  ('%תזונה בריאה%', '%תזונה בריאה%'),
  ('%רשימת קניות%', '%קניות%'),
  ('מסמך בניית האימונים', '%בניית האימונים%')
)
UPDATE public.program_content n
SET video_url = COALESCE(n.video_url, o.video_url),
    resource_link = COALESCE(n.resource_link, o.resource_link)
FROM links l
JOIN LATERAL (
  SELECT video_url, resource_link FROM public.program_content o
  WHERE o.archived_at IS NOT NULL AND o.title ILIKE l.old_pattern AND (o.video_url IS NOT NULL OR o.resource_link IS NOT NULL)
  ORDER BY o.created_at DESC LIMIT 1
) o ON true
WHERE n.archived_at IS NULL AND n.title ILIKE l.new_pattern AND n.video_url IS NULL AND n.resource_link IS NULL;

-- Trainees already mid-program: content that opened more than a week before
-- today in their program counts as done, so the step-by-step gate doesn't
-- send them back to week 1. (Only new items; nothing is removed.)
INSERT INTO public.content_progress (user_id, content_id)
SELECT p.id, c.id
FROM public.profiles p
JOIN public.program_content c ON c.archived_at IS NULL
WHERE p.start_date IS NOT NULL
  AND c.unlock_day + 7 <= (CURRENT_DATE - p.start_date) + 1
  AND NOT EXISTS (SELECT 1 FROM public.content_progress cp WHERE cp.user_id = p.id AND cp.content_id = c.id);

-- ── 3. Habits (global; personal habits untouched) ────────────────────────────
DROP TABLE IF EXISTS v2_habits;
CREATE TEMP TABLE v2_habits (
  name TEXT, day_start INT, day_end INT, icon TEXT, visual_key TEXT, plate_zone TEXT,
  explanation TEXT, schedule_rule JSONB
);

INSERT INTO v2_habits VALUES
  -- Week 1 → from day 2
  ('2 כוסות מים לפני ארוחה גדולה', 2, NULL, 'droplets', 'water_before_meal', 'side', '2 כוסות מים לפני הארוחה – מעלה שובע ומונע אכילה מופרזת', NULL),
  ('כוס מים לפני ארוחה קטנה, נשנוש או מתוק', 2, NULL, 'droplets', 'water_before_snack', 'side', 'כוס מים קודם – לפעמים זה צמא ולא רעב', NULL),
  ('הליכה פעם בשבוע, 20–30 דקות', 2, 23, 'footprints', NULL, 'side', 'מסמנים באפליקציה את יום ההליכה', NULL),
  -- Week 2 → day 9
  ('מתחילים לאכול 3 שעות אחרי הקימה', 9, NULL, 'timer', 'routine_wake_eat', 'side', 'חלון אכילה קצר יותר – פחות הזדמנויות לנשנש',
      '{"anchor": "wake", "offset_minutes": 180, "label": "מתחילים לאכול"}'),
  ('מפסיקים לאכול שעה לפני השינה', 9, 106, 'moon', 'routine_stop_eating', 'side', 'המטבח נסגר שעה לפני השינה – שינה טובה יותר',
      '{"anchor": "sleep", "offset_minutes": -60, "label": "מפסיקים לאכול"}'),
  ('ירקות בכל ארוחה, בעיקר בגדולות', 9, 71, 'apple', 'plate_veggies', 'plate', 'מעלים זמינות: ירקות מול העיניים', NULL),
  -- Week 3 → day 16
  ('שמן זית במקום קנולה, ושמים לב לכמות', 16, NULL, 'droplets', 'olive_oil', 'side', 'שמן בריא יותר – ועדיין שמן, אז שמים לב לכמות', NULL),
  ('שתייה מתוקה: כוס אחת ביום', 16, 57, 'droplets', 'no_sweet_drinks', 'side', 'כוס אחת, ולא יותר', NULL),
  ('בקפה: חצי מהסוכר', 16, 85, 'droplets', 'coffee_sugar', 'side', 'חצי כפית במקום כפית – מתרגלים מהר', NULL),
  ('שינה: השעות של היום + 8, חלקי 2', 16, 106, 'moon', 'routine_sleep', 'side', 'חדר קר, חושך, בלי מסכים, שעה קבועה', NULL),
  -- Week 4 → day 23
  ('2 הליכות בשבוע', 23, NULL, 'footprints', NULL, 'side', 'מסמנים באפליקציה', NULL),
  ('אוכלים בצלחת אחת, בלי ריפילים או נשנושים מהצד', 23, NULL, 'target', 'one_plate', 'plate', 'מה שעל הצלחת – זו הארוחה', NULL),
  ('בוחרים רוטב אחד לכל ארוחה', 23, 71, 'target', 'one_sauce', 'side', 'רוטב אחד – ונהנים ממנו', NULL),
  -- Weeks 5–6 → day 30
  ('סידור ארוחות: 2 גדולות, ביניים ומתוקה', 30, 225, 'star', 'meals_4', 'side', '4 ארוחות ביום, כל אחת בזמן שלה',
      '{"type": "meals", "meals": [
         {"key": "brunch", "label": "ארוחת בוקר-צהריים", "size": "big",   "explanation": "הארוחה הגדולה הראשונה – פותחת את חלון האכילה"},
         {"key": "snack",  "label": "ארוחת ביניים",      "size": "small", "explanation": "ארוחה קטנה באמצע היום, שלא נגיע רעבים לערב"},
         {"key": "sweet",  "label": "ארוחה מתוקה",       "size": "small", "explanation": "כאן נכנס המתוק של היום, בלי רגשות אשם"},
         {"key": "dinner", "label": "ארוחת ערב",         "size": "big",   "explanation": "הארוחה הגדולה השנייה – ואחריה המטבח נסגר"}]}'),
  ('אימון אחד בשבוע', 30, 57, 'dumbbell', NULL, 'side', NULL, NULL),
  ('חלבון בכל ארוחה', 30, 71, 'target', NULL, 'plate', 'חלבון משביע ושומר על השריר', NULL),
  -- Weeks 7–8 → day 44
  ('6,000 צעדים ביום בממוצע', 44, 85, 'footprints', NULL, 'side', 'ממוצע שבועי – יום חלש מתקזז ביום חזק', NULL),
  ('2 עד 3 ליטר מים ביום', 44, 225, 'droplets', NULL, 'side', NULL, NULL),
  -- Weeks 9–10 → day 58
  ('2 עד 3 אימונים בשבוע', 58, NULL, 'dumbbell', NULL, 'side', NULL, NULL),
  ('זירו במקום משקאות מתוקים', 58, NULL, 'droplets', 'no_sweet_drinks', 'side', 'אותו טעם, בלי הסוכר', NULL),
  ('פירות במקום נשנושים ושוקולדים', 58, NULL, 'apple', 'fruit_snack', 'side', 'מתוק טבעי במקום מתוק מעובד', NULL),
  -- Weeks 11–12 → day 72
  ('לחלק את הצלחת לשליש חלבון / פחמימה / ירק', 72, NULL, 'target', 'plate_thirds', 'plate', 'שליש חלבון, שליש פחמימה, שליש ירק', NULL),
  ('בחירת רוטב אחד, פעם אחת ביום', 72, NULL, 'target', 'one_sauce', 'side', 'רוטב אחד ביום – בארוחה שהכי שווה', NULL),
  ('דילול מאכלים עתירי קלוריות ב-80%', 72, NULL, 'target', NULL, 'side', 'פחות ממה שמשמין, בלי לוותר עליו לגמרי', NULL),
  -- Weeks 13–15 → day 86
  ('8,000 צעדים ביום בממוצע', 86, NULL, 'footprints', NULL, 'side', NULL, NULL),
  ('בלי סוכר בקפה', 86, NULL, 'droplets', 'coffee_sugar', 'side', NULL, NULL),
  -- Weeks 16–18 → day 107
  ('מפסיקים לאכול שעתיים לפני השינה', 107, NULL, 'moon', 'routine_stop_eating', 'side', 'סוגרים את המטבח שעתיים לפני השינה',
      '{"anchor": "sleep", "offset_minutes": -120, "label": "מפסיקים לאכול"}'),
  ('משפרים את שעות השינה לפי הנוסחה', 107, NULL, 'moon', 'routine_sleep', 'side', 'השעות של היום + 8, חלקי 2 – וקמים באותה שעה', NULL),
  -- Weeks 19–21 → day 128
  ('90% מהזמן אוכלים בריא', 128, NULL, 'apple', NULL, 'side', NULL, NULL),
  ('בודקים את רשימת הרכיבים במוצרים', 128, NULL, 'target', NULL, 'side', NULL, NULL),
  -- Weeks 22–24 → day 149
  ('2 גרם חלבון לכל קילו משקל גוף', 149, NULL, 'target', NULL, 'plate', NULL, NULL),
  -- Weeks 25–28 → day 170
  ('מדרגים כל הרגל באחוזים', 170, NULL, 'star', NULL, 'side', NULL, NULL),
  ('משפרים את ההרגל החלש עד 100%', 170, NULL, 'star', NULL, 'side', NULL, NULL),
  ('מתעדפים את אורח החיים בלו"ז', 170, NULL, 'star', NULL, 'side', NULL, NULL),
  -- Weeks 33–36 → day 226
  ('2 ארוחות גדולות ביום', 226, NULL, 'star', 'meals_4', 'side', 'שתי ארוחות גדולות, וארוחה קטנה רק אם צריך',
      '{"type": "meals", "meals": [
         {"key": "brunch", "label": "ארוחת בוקר-צהריים", "size": "big",   "explanation": "הארוחה הגדולה הראשונה – פותחת את חלון האכילה"},
         {"key": "small",  "label": "ארוחה קטנה",        "size": "small", "optional": true, "explanation": "רק אם רעבים – לא חובה"},
         {"key": "dinner", "label": "ארוחת ערב",         "size": "big",   "explanation": "הארוחה הגדולה השנייה – ואחריה המטבח נסגר"}]}'),
  ('2.5 עד 3.5 ליטר מים ביום', 226, NULL, 'droplets', NULL, 'side', NULL, NULL);

-- Old global habits not in the list: retired (hidden; trainees' ticks kept).
UPDATE public.habit_definitions h
SET day_end = 0
WHERE h.user_id IS NULL
  AND h.day_end IS DISTINCT FROM 0
  AND NOT EXISTS (SELECT 1 FROM v2_habits v WHERE v.name = h.name);

INSERT INTO public.habit_definitions (name, day_start, day_end, week_start, week_end, icon, is_bonus, visual_key, plate_zone, explanation, schedule_rule)
SELECT v.name, v.day_start, v.day_end,
       ((v.day_start - 2) / 7) + 1, CASE WHEN v.day_end IS NULL THEN NULL ELSE ((v.day_end - 2) / 7) + 1 END,
       v.icon, false, v.visual_key, v.plate_zone, v.explanation, v.schedule_rule
FROM v2_habits v
WHERE NOT EXISTS (SELECT 1 FROM public.habit_definitions h WHERE h.name = v.name AND h.user_id IS NULL);

UPDATE public.habit_definitions h
SET day_start = v.day_start, day_end = v.day_end,
    week_start = ((v.day_start - 2) / 7) + 1,
    week_end = CASE WHEN v.day_end IS NULL THEN NULL ELSE ((v.day_end - 2) / 7) + 1 END,
    icon = v.icon, is_bonus = false, visual_key = v.visual_key, plate_zone = v.plate_zone,
    explanation = v.explanation, schedule_rule = v.schedule_rule
FROM v2_habits v
WHERE h.name = v.name AND h.user_id IS NULL;

-- בדיקה: 15. תוכנית v2: תכנים והרגלים מחדש
SELECT '15' AS section, 'program_content.archived_at' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'program_content' AND column_name = 'archived_at')) AS ok
UNION ALL
SELECT '15' AS section, '29 תכנים פעילים' AS "check", ((SELECT count(*) FROM public.program_content WHERE archived_at IS NULL) = 29) AS ok
UNION ALL
SELECT '15' AS section, 'ברוכים הבאים ביום 1' AS "check", (EXISTS (SELECT 1 FROM public.program_content WHERE title = 'ברוכים הבאים: סוויץ'' במוח' AND unlock_day = 1 AND archived_at IS NULL)) AS ok
UNION ALL
SELECT '15' AS section, '"שעתיים לפני השינה" מיום 107' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'מפסיקים לאכול שעתיים לפני השינה' AND user_id IS NULL AND day_start = 107 AND schedule_rule IS NOT NULL)) AS ok
UNION ALL
SELECT '15' AS section, 'כל ההרגל של התוכנית מתחיל יום אחרי התוכן' AS "check", (NOT EXISTS (SELECT 1 FROM public.habit_definitions h WHERE h.user_id IS NULL AND h.day_end IS DISTINCT FROM 0 AND h.day_start NOT IN (2, 9, 16, 23, 30, 44, 58, 72, 86, 107, 128, 149, 170, 226))) AS ok
UNION ALL
SELECT '15' AS section, 'שמות החלקים' AS "check", ((SELECT count(*) FROM public.program_parts WHERE part_number BETWEEN 1 AND 4 AND name IS NOT NULL) = 4) AS ok;

COMMIT;


-- =============================================================================
-- סיכום: כל הבדיקות. כל השורות צריכות להיות ok = true. את הטבלה הזו להחזיר לי.
-- =============================================================================
SELECT '0' AS section, 'has_role קיימת' AS "check", (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_role')) AS ok
UNION ALL
SELECT '0' AS section, 'is_admin קיימת' AS "check", (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'is_admin')) AS ok
UNION ALL
SELECT '0' AS section, 'exercises קיימת' AS "check", (to_regclass('public.exercises') IS NOT NULL) AS ok
UNION ALL
SELECT '0' AS section, 'workout_plan_days קיימת' AS "check", (to_regclass('public.workout_plan_days') IS NOT NULL) AS ok
UNION ALL
SELECT '0' AS section, 'weight_log קיימת' AS "check", (to_regclass('public.weight_log') IS NOT NULL) AS ok
UNION ALL
SELECT '0א' AS section, 'referrals' AS "check", (to_regclass('public.referrals') IS NOT NULL) AS ok
UNION ALL
SELECT '0א' AS section, 'policy users_insert_own_referrals' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'users_insert_own_referrals')) AS ok
UNION ALL
SELECT '0ב' AS section, 'policy admins_select_all_activity_log' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_log' AND policyname = 'admins_select_all_activity_log')) AS ok
UNION ALL
SELECT '0ג' AS section, 'policy Admins can delete weight logs' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weight_log' AND policyname = 'Admins can delete weight logs')) AS ok
UNION ALL
SELECT '0ד' AS section, 'התרגילים קיימים' AS "check", (EXISTS (SELECT 1 FROM public.exercises WHERE name = 'פושדאון אחיזה הפוכה - כבל')) AS ok
UNION ALL
SELECT '1' AS section, 'trigger על weight_log' AS "check", (EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'weight_log_sync_current_weight' AND NOT tgisinternal)) AS ok
UNION ALL
SELECT '2' AS section, 'step_sync_devices' AS "check", (to_regclass('public.step_sync_devices') IS NOT NULL) AS ok
UNION ALL
SELECT '2' AS section, 'sync_steps_with_token' AS "check", (EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'sync_steps_with_token')) AS ok
UNION ALL
SELECT '3' AS section, 'onboarding_responses' AS "check", (to_regclass('public.onboarding_responses') IS NOT NULL) AS ok
UNION ALL
SELECT '3' AS section, 'body_measurements' AS "check", (to_regclass('public.body_measurements') IS NOT NULL) AS ok
UNION ALL
SELECT '3' AS section, 'body_photos' AS "check", (to_regclass('public.body_photos') IS NOT NULL) AS ok
UNION ALL
SELECT '3' AS section, 'profiles.age' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'age')) AS ok
UNION ALL
SELECT '3' AS section, 'bucket body-photos' AS "check", (EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'body-photos')) AS ok
UNION ALL
SELECT '4' AS section, 'habit_definitions.plate_zone' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habit_definitions' AND column_name = 'plate_zone')) AS ok
UNION ALL
SELECT '4' AS section, 'calendar_events' AS "check", (to_regclass('public.calendar_events') IS NOT NULL) AS ok
UNION ALL
SELECT '5' AS section, 'external_workouts' AS "check", (to_regclass('public.external_workouts') IS NOT NULL) AS ok
UNION ALL
SELECT '6' AS section, 'profiles.referral_code' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referral_code')) AS ok
UNION ALL
SELECT '6' AS section, 'referrals.friend_knows' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'friend_knows')) AS ok
UNION ALL
SELECT '6' AS section, 'notification_settings.prefs' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_settings' AND column_name = 'prefs')) AS ok
UNION ALL
SELECT '6' AS section, 'policy admins_manage_all_referrals' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'admins_manage_all_referrals')) AS ok
UNION ALL
SELECT '7' AS section, 'habit_definitions.visual_key' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habit_definitions' AND column_name = 'visual_key')) AS ok
UNION ALL
SELECT '7' AS section, 'workout_set_logs' AS "check", (to_regclass('public.workout_set_logs') IS NOT NULL) AS ok
UNION ALL
SELECT '7' AS section, 'workout_session_logs.difficulty' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workout_session_logs' AND column_name = 'difficulty')) AS ok
UNION ALL
SELECT '7' AS section, 'activity_log.source' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activity_log' AND column_name = 'source')) AS ok
UNION ALL
SELECT '8' AS section, 'profiles.sleep_time' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'sleep_time')) AS ok
UNION ALL
SELECT '8' AS section, 'daily_summaries' AS "check", (to_regclass('public.daily_summaries') IS NOT NULL) AS ok
UNION ALL
SELECT '8' AS section, 'השאלון השבועי כבוי' AS "check", (NOT EXISTS (SELECT 1 FROM public.checkin_questions WHERE is_active)) AS ok
UNION ALL
SELECT '9' AS section, 'program_content.duration_minutes' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'program_content' AND column_name = 'duration_minutes')) AS ok
UNION ALL
SELECT '9' AS section, 'program_parts' AS "check", (to_regclass('public.program_parts') IS NOT NULL) AS ok
UNION ALL
SELECT '10' AS section, 'program_content.category' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'program_content' AND column_name = 'category')) AS ok
UNION ALL
SELECT '11' AS section, 'activities' AS "check", (to_regclass('public.activities') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'activity_tracks' AS "check", (to_regclass('public.activity_tracks') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'my_workouts' AS "check", (to_regclass('public.my_workouts') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'my_workout_exercises' AS "check", (to_regclass('public.my_workout_exercises') IS NOT NULL) AS ok
UNION ALL
SELECT '11' AS section, 'trigger day לפי ישראל' AS "check", (EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'activities_set_day' AND NOT tgisinternal)) AS ok
UNION ALL
SELECT '11' AS section, 'מסלולים: אין גישת מנהל' AS "check", (NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activity_tracks' AND policyname ILIKE '%admin%')) AS ok
UNION ALL
SELECT '11' AS section, 'לא נשארו הערות JSON ידניות' AS "check", (NOT EXISTS (SELECT 1 FROM public.workout_session_logs WHERE CASE WHEN pg_input_is_valid(notes, 'jsonb') THEN notes::jsonb->>'source' = 'manual' ELSE false END)) AS ok
UNION ALL
SELECT '12' AS section, 'habit_definitions.schedule_rule' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habit_definitions' AND column_name = 'schedule_rule')) AS ok
UNION ALL
SELECT '12' AS section, 'profiles.meal_times' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'meal_times')) AS ok
UNION ALL
SELECT '12' AS section, '"שעה לפני השינה" עד יום 105' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE id = '85c1ebdf-6aca-45bb-b64a-6166ab9dc5ff' AND day_end = 105 AND schedule_rule IS NOT NULL)) AS ok
UNION ALL
SELECT '12' AS section, '"שעתיים לפני השינה" מיום 106' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'להפסיק לאכול שעתיים לפני השינה' AND day_start = 106 AND schedule_rule IS NOT NULL)) AS ok
UNION ALL
SELECT '12' AS section, '4 ארוחות עד יום 224' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE id = '1f869ea4-2786-4e3c-ba9a-c54646789ecc' AND day_end = 224 AND schedule_rule->>'type' = 'meals')) AS ok
UNION ALL
SELECT '12' AS section, '"שתי ארוחות ביום" מיום 225' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'שתי ארוחות ביום' AND day_start = 225)) AS ok
UNION ALL
SELECT '13' AS section, 'calendar_placements' AS "check", (to_regclass('public.calendar_placements') IS NOT NULL) AS ok
UNION ALL
SELECT '13' AS section, 'policy Trainee manages own placements' AS "check", (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_placements' AND policyname = 'Trainee manages own placements')) AS ok
UNION ALL
SELECT '13' AS section, 'calendar_placements.valid_from' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_placements' AND column_name = 'valid_from')) AS ok
UNION ALL
SELECT '14' AS section, 'calendar_events.repeat_rule' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'repeat_rule')) AS ok
UNION ALL
SELECT '14' AS section, 'calendar_events.excluded_days' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'excluded_days')) AS ok
UNION ALL
SELECT '14' AS section, 'calendar_events.parent_id' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'parent_id')) AS ok
UNION ALL
SELECT '14' AS section, 'עד 7 הליכות בשבוע' AS "check", (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_walking_schedule_walk_number_check' AND pg_get_constraintdef(oid) LIKE '%7%')) AS ok
UNION ALL
SELECT '15' AS section, 'program_content.archived_at' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'program_content' AND column_name = 'archived_at')) AS ok
UNION ALL
SELECT '15' AS section, '29 תכנים פעילים' AS "check", ((SELECT count(*) FROM public.program_content WHERE archived_at IS NULL) = 29) AS ok
UNION ALL
SELECT '15' AS section, 'ברוכים הבאים ביום 1' AS "check", (EXISTS (SELECT 1 FROM public.program_content WHERE title = 'ברוכים הבאים: סוויץ'' במוח' AND unlock_day = 1 AND archived_at IS NULL)) AS ok
UNION ALL
SELECT '15' AS section, '"שעתיים לפני השינה" מיום 107' AS "check", (EXISTS (SELECT 1 FROM public.habit_definitions WHERE name = 'מפסיקים לאכול שעתיים לפני השינה' AND user_id IS NULL AND day_start = 107 AND schedule_rule IS NOT NULL)) AS ok
UNION ALL
SELECT '15' AS section, 'כל ההרגל של התוכנית מתחיל יום אחרי התוכן' AS "check", (NOT EXISTS (SELECT 1 FROM public.habit_definitions h WHERE h.user_id IS NULL AND h.day_end IS DISTINCT FROM 0 AND h.day_start NOT IN (2, 9, 16, 23, 30, 44, 58, 72, 86, 107, 128, 149, 170, 226))) AS ok
UNION ALL
SELECT '15' AS section, 'שמות החלקים' AS "check", ((SELECT count(*) FROM public.program_parts WHERE part_number BETWEEN 1 AND 4 AND name IS NOT NULL) = 4) AS ok
UNION ALL
SELECT 'אחסון', 'bucket profile_photos (האפליקציה מעלה אליו קבצים)', EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'profile_photos')
UNION ALL
SELECT 'אחסון', 'bucket videos (האפליקציה מעלה אליו קבצים)', EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos')
UNION ALL
SELECT 'אחסון', 'bucket exercise_media (האפליקציה מעלה אליו קבצים)', EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'exercise_media')
UNION ALL
SELECT 'אחסון', 'bucket meal_photos (האפליקציה מעלה אליו קבצים)', EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'meal_photos')
UNION ALL
SELECT 'אחסון', 'bucket body-photos (האפליקציה מעלה אליו קבצים)', EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'body-photos')
UNION ALL
SELECT 'מספרים', 'שאלון: שורות ב-onboarding_responses = ' || (SELECT count(*) FROM public.onboarding_responses), true
UNION ALL
SELECT 'מספרים', 'הרגלים עם visual_key = ' || (SELECT count(*) FROM public.habit_definitions WHERE visual_key IS NOT NULL) || ' מתוך ' || (SELECT count(*) FROM public.habit_definitions), true
UNION ALL
SELECT 'מספרים', 'אימונים ידניים שהומרו ל-activities = ' || (SELECT count(*) FROM public.activities WHERE source = 'manual' AND session_id IS NOT NULL), true
UNION ALL
SELECT 'מספרים', 'מדריכים עם נושא = ' || (SELECT count(*) FROM public.program_content WHERE category IS NOT NULL), true;
