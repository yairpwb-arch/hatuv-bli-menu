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
