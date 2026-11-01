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
  FROM unnest(ARRAY['calendar_events', 'habit_definitions', 'profiles', 'user_walking_schedule']) AS t
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
