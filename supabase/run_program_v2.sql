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
  FROM unnest(ARRAY['content_progress', 'habit_definitions', 'profiles', 'program_content', 'program_parts']) AS t
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
  (5, 1, 'פתיחה', 1, 'guide', false, 'מדריך: מנטליות הרגלים', 'איך חושבים על הרגלים, ולמה שינוי קטן מחזיק לאורך זמן.', 'sleep'),
  (10, 1, 'פתיחה', 1, 'video', false, 'ברוכים הבאים: סוויץ'' במוח', 'איך עובד התהליך, ולמה הפעם זה יעבוד.', NULL),
  (11, 1, 'פתיחה', 1, 'guide', false, 'מדריך: איך להישקל', 'מתי, איך ובאיזו תדירות שוקלים, ולמה המשקל קופץ.', 'nutrition'),
  (13, 1, 'פתיחה', 1, 'guide', false, 'מדריך: אני חולה, מה עושים?', 'איך שומרים על ההרגלים כשלא מרגישים טוב.', 'sleep'),
  (14, 1, 'פתיחה', 1, 'video', true,  'סרטון העשרה: צימוד הרגלים', 'לוקחים הרגל קיים ומצמידים אליו הרגל טוב.', NULL),
  (20, 1, 'שבוע 1', 1, 'video', false, 'שבוע 1: מים לפני האוכל והליכה ראשונה',
      '2 כוסות מים לפני ארוחה גדולה · כוס מים לפני ארוחה קטנה, נשנוש או מתוק · הליכה פעם בשבוע, 20–30 דקות (מסמנים באפליקציה את יום ההליכה).', NULL),
  (30, 1, 'שבוע 2', 8, 'video', false, 'שבוע 2: חלון האכילה וירקות בכל ארוחה',
      'מתחילים לאכול 3 שעות אחרי הקימה · מפסיקים לאכול שעה לפני השינה · ירקות בכל ארוחה, בעיקר בגדולות.', NULL),
  (15, 1, 'פתיחה', 1, 'video', true,  'סרטון העשרה: העלאת זמינות', 'מקלים על הטוב ומקשים על הרע — למשל ירקות מול העיניים.', NULL),
  (40, 1, 'שבוע 3', 15, 'video', false, 'שבוע 3: שמן זית, שתייה מתוקה ושינה',
      'שמן זית במקום קנולה, ושמים לב לכמות · שתייה מתוקה: כוס אחת, בקפה חצי מהסוכר · שינה: השעות של היום + 8, חלקי 2 — חדר קר, חושך, בלי מסכים, שעה קבועה.', NULL),
  (41, 1, 'שבוע 3', 15, 'guide', false, 'מדריך: חו"ל ונופש', 'אפשר לצאת לחופשה, ליהנות, ועדיין לחזור עם תחושת שליטה.', 'events'),
  (50, 1, 'שבוע 4', 22, 'video', false, 'שבוע 4: צלחת אחת, רוטב אחד ו-2 הליכות',
      '2 הליכות בשבוע · אוכלים בצלחת אחת, בלי ריפילים או נשנושים מהצד · רוטב אחד לכל ארוחה.', NULL),
  -- Part 2 · a video every two weeks
  (55, 2, 'שבועות 5–6', 29, 'video', false, 'חלק 2: מוסיפים ומשפרים', 'פותחים את החלק השני: מה מחכה לכם בשבועות 5–12.', NULL),
  (63, 2, 'שבועות 5–6', 29, 'video', false, 'שבועות 5–6: סידור ארוחות, אימון וחלבון',
      'סידור ארוחות: 2 גדולות, ביניים ומתוקה · אימון אחד בשבוע · חלבון בכל ארוחה.', NULL),
  (56, 2, 'שבועות 5–6', 29, 'guide', false, 'מדריך: סופ"שים, אירועים ומסעדות', 'מדריך פשוט ובגובה העיניים, כדי להרגיש קלילים יותר גם בסופ"שים, במסעדות ובאירועים.', 'events'),
  (57, 2, 'שבועות 5–6', 29, 'guide', false, 'מדריך: על האש עם חברים', 'בלי רגשות אשם.', 'events'),
  (64, 2, 'שבועות 5–6', 29, 'guide', false, 'מדריך: רגעים לא צפויים', 'איך לא לאבד שליטה.', 'events'),
  (65, 2, 'שבועות 5–6', 29, 'guide', false, 'מדריך: סידור הארוחות בצורה נכונה', 'בצורה נכונה: 2 ארוחות גדולות ו-2 ארוחות קטנות.', 'nutrition'),
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
  (92, 2, 'שבועות 11–12', 71, 'guide', false, 'מדריך: רשימת קניות', 'מאכלים בנפח גדול ודלי קלוריות, שכדאי שיהיו תמיד בבית.', 'nutrition'),
  -- Part 3 · a video every three weeks
  (95, 3, 'שבועות 13–15', 85, 'video', false, 'חלק 3: מדייקים את ההרגלים', 'פותחים את החלק השלישי: מה מחכה לכם בשבועות 13–24.', NULL),
  (100, 3, 'שבועות 13–15', 85, 'video', false, 'שבועות 13–15: משפרים את מה שכבר קיים',
      'מי שעוד לא רואה תוצאה, זה הזמן להתחיל להקפיד. 8,000 צעדים ביום בממוצע · בלי סוכר בקפה.', NULL),
  (110, 3, 'שבועות 16–18', 106, 'video', false, 'שבועות 16–18: שעתיים לפני השינה',
      'מפסיקים לאכול שעתיים לפני השינה · משפרים את שעות השינה לפי הנוסחה.', NULL),
  (120, 3, 'שבועות 19–21', 127, 'video', false, 'שבועות 19–21: 90% בריא ורשימת רכיבים',
      '90% מהזמן אוכלים בריא · בודקים את רשימת הרכיבים במוצרים.', NULL),
  (130, 3, 'שבועות 22–24', 148, 'video', false, 'שבועות 22–24: חלבון לפי משקל',
      '2 גרם חלבון לכל קילו משקל גוף.', NULL),
  -- Part 4 · a video every four weeks
  (135, 4, 'שבועות 25–28', 169, 'video', false, 'חלק 4: המאמנים של עצמכם', 'פותחים את החלק הרביעי: מה מחכה לכם בשבועות 25–36.', NULL),
  (140, 4, 'שבועות 25–28', 169, 'video', false, 'שבועות 25–28: מדרגים ומשפרים',
      'עוד כלים לאורח חיים בריא, ולומדים לבנות תוכניות לעצמכם. מדרגים כל הרגל באחוזים · משפרים את ההרגל החלש עד 100% · מתעדפים את אורח החיים בלו"ז.', NULL),
  (150, 4, 'שבועות 29–32', 197, 'video', false, 'שבועות 29–32: בונים אימונים לבד', 'קוראים את המסמך של בניית האימונים.', NULL),
  (151, 4, 'שבועות 29–32', 197, 'guide', false, 'מדריך: איך להיות המאמן של עצמכם', 'המאמן של עצמכם.', 'training'),
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

-- The home plate's protein third can be its own habit ("חלבון בכל ארוחה").
ALTER TABLE public.habit_definitions DROP CONSTRAINT IF EXISTS habit_definitions_visual_key_check;
ALTER TABLE public.habit_definitions ADD CONSTRAINT habit_definitions_visual_key_check CHECK (visual_key IN (
  'water_before_meal', 'plate_thirds', 'plate_veggies', 'plate_protein', 'one_plate', 'one_sauce',
  'slow_eating', 'olive_oil', 'fruit_snack', 'water_before_snack', 'meals_4',
  'routine_wake_eat', 'routine_stop_eating', 'routine_sleep',
  'no_sweet_drinks', 'coffee_sugar'
));

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
  ('חלבון בכל ארוחה', 30, 71, 'target', 'plate_protein', 'plate', 'חלבון משביע ושומר על השריר', NULL),
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
SELECT '15' AS section, '35 תכנים פעילים' AS "check", ((SELECT count(*) FROM public.program_content WHERE archived_at IS NULL) = 35) AS ok
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
SELECT '15' AS section, 'program_content.archived_at' AS "check", (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'program_content' AND column_name = 'archived_at')) AS ok
UNION ALL
SELECT '15' AS section, '35 תכנים פעילים' AS "check", ((SELECT count(*) FROM public.program_content WHERE archived_at IS NULL) = 35) AS ok
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
