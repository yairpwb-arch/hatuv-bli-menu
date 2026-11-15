-- =============================================================================
-- What else went missing since program v2 (1.11), found by comparing the program
-- to today's backup (14.11, 15:25). Weeks 1 and 4 are already back.
--   1. The weeks 11–12 video was deleted: back, with its video and the bot's knowledge.
--   2. Two habits of the program are gone (nothing took their place):
--        "מתחילים לאכול 3 שעות אחרי הקימה" (from day 9) and "שתייה מתוקה: כוס אחת ביום" (days 16–57).
--   3. A double: "להפסיק לאכול שעה לפני השינה" (an old habit, its end day set to 18970)
--      is shown next to the program's "מפסיקים לאכול שעה לפני השינה". The old one is
--      retired like the other old ones (day_end = 0: hidden, the trainees' ticks kept).
-- Paste into the SQL Editor and run. Safe to run more than once.
-- =============================================================================
BEGIN;

-- ── 1. Weeks 11–12 ───────────────────────────────────────────────────────────
UPDATE public.program_content c
SET archived_at = NULL
WHERE c.id = (
  SELECT id FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבועות 11–12:%' AND archived_at IS NOT NULL
  ORDER BY archived_at DESC LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבועות 11–12:%' AND archived_at IS NULL
);

INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order)
SELECT 2, 'שבועות 11–12', 71, 'שבועות 11–12: הצלחת המחולקת ודילול',
       'לחלק את הצלחת לשליש חלבון / פחמימה / ירק · בחירת רוטב אחד פעם אחת ביום · דילול מאכלים עתירי קלוריות 80%.',
       'video', false, 90
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבועות 11–12:%' AND archived_at IS NULL
);

UPDATE public.program_content
SET part_number = 2, week_range = 'שבועות 11–12', unlock_day = 71, is_bonus = false,
    video_url = COALESCE(NULLIF(video_url, ''), 'bunny:ef145f22-0941-44ec-829e-4e1a22095130')
WHERE content_type = 'video' AND title LIKE 'שבועות 11–12:%' AND archived_at IS NULL;

UPDATE public.bot_knowledge k
SET content_id = c.id, title = c.title, unlock_day = c.unlock_day
FROM (
  SELECT id, title, unlock_day FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבועות 11–12:%' AND archived_at IS NULL
  ORDER BY sort_order LIMIT 1
) c
WHERE k.source = 'video'
  AND (k.title LIKE 'שבועות 11–12:%' OR k.title LIKE 'סרטון: שבועות 11%'
       OR k.content_id IN (SELECT id FROM public.program_content WHERE title LIKE 'שבועות 11–12:%'));

-- ── 2. The two habits ────────────────────────────────────────────────────────
INSERT INTO public.habit_definitions (name, day_start, day_end, week_start, week_end, icon, is_bonus, visual_key, plate_zone, explanation, schedule_rule)
SELECT v.name, v.day_start, v.day_end,
       ((v.day_start - 2) / 7) + 1, CASE WHEN v.day_end IS NULL THEN NULL ELSE ((v.day_end - 2) / 7) + 1 END,
       v.icon, false, v.visual_key, v.plate_zone, v.explanation, v.schedule_rule
FROM (VALUES
  ('מתחילים לאכול 3 שעות אחרי הקימה', 9, NULL::int, 'timer', 'routine_wake_eat', 'side',
   'חלון אכילה קצר יותר – פחות הזדמנויות לנשנש',
   '{"anchor": "wake", "offset_minutes": 180, "label": "מתחילים לאכול"}'::jsonb),
  ('שתייה מתוקה: כוס אחת ביום', 16, 57, 'droplets', 'no_sweet_drinks', 'side', 'כוס אחת, ולא יותר', NULL::jsonb)
) AS v(name, day_start, day_end, icon, visual_key, plate_zone, explanation, schedule_rule)
WHERE NOT EXISTS (SELECT 1 FROM public.habit_definitions h WHERE h.name = v.name AND h.user_id IS NULL);

-- Already there but retired (day_end = 0): active again, on its days.
UPDATE public.habit_definitions
SET day_end = NULL, week_end = NULL
WHERE user_id IS NULL AND name = 'מתחילים לאכול 3 שעות אחרי הקימה' AND day_end = 0;
UPDATE public.habit_definitions
SET day_end = 57, week_end = ((57 - 2) / 7) + 1
WHERE user_id IS NULL AND name = 'שתייה מתוקה: כוס אחת ביום' AND day_end = 0;

-- ── 3. The double "stop eating an hour before bed" ───────────────────────────
UPDATE public.habit_definitions
SET day_end = 0
WHERE user_id IS NULL AND name = 'להפסיק לאכול שעה לפני השינה' AND day_end IS DISTINCT FROM 0
  AND EXISTS (SELECT 1 FROM public.habit_definitions x WHERE x.user_id IS NULL AND x.name = 'מפסיקים לאכול שעה לפני השינה' AND x.day_end IS DISTINCT FROM 0);

COMMIT;

-- Check: the active general habits by day (the two should be there, the double gone),
-- and the weeks 11–12 video.
SELECT 'habit' AS what, day_start, day_end, name FROM public.habit_definitions
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0
UNION ALL
SELECT 'video', unlock_day, NULL, title FROM public.program_content
WHERE title LIKE 'שבועות 11–12:%' AND archived_at IS NULL
ORDER BY 2, 1;
