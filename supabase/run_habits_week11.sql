-- =============================================================================
-- Weeks 11–12, as the video says: the plate in thirds, one sauce a day, 80%
-- healthy, and the shopping list with the healthy-eating guide, all from day 71.
-- Global habits only (user_id IS NULL); trainees' ticks are kept.
-- Safe to run more than once.
-- =============================================================================
BEGIN;

-- 1. The plate in thirds: from day 71 (not 29).
UPDATE public.habit_definitions
SET day_start = 71, day_end = NULL, visual_key = 'plate_thirds', plate_zone = 'plate'
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0 AND name ILIKE '%שליש%';

-- 2. One sauce: per meal on days 22–70, then per day from 71 (the same object on the table).
UPDATE public.habit_definitions
SET name = 'רוטב אחד בארוחה', day_start = 22, day_end = 70, visual_key = 'one_sauce'
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0
  AND name ILIKE '%רוטב%' AND name NOT ILIKE '%ביום%';

UPDATE public.habit_definitions
SET name = 'רוטב אחד ביום', day_start = 71, day_end = NULL, visual_key = 'one_sauce',
    explanation = COALESCE(explanation, 'רוטב אחד ביום, בארוחה שהכי שווה')
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0
  AND name ILIKE '%רוטב%' AND name ILIKE '%ביום%';

INSERT INTO public.habit_definitions (name, day_start, day_end, icon, is_bonus, visual_key, plate_zone, explanation)
SELECT 'רוטב אחד ביום', 71, NULL, 'target', false, 'one_sauce', 'side', 'רוטב אחד ביום, בארוחה שהכי שווה'
WHERE NOT EXISTS (SELECT 1 FROM public.habit_definitions WHERE user_id IS NULL AND name = 'רוטב אחד ביום');

-- 3. 80% healthy on days 71–126, then 90% from day 127.
UPDATE public.habit_definitions
SET name = '80% מהזמן אוכלים בריא', day_start = 71, day_end = 126
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0 AND name LIKE '%80\%%';

INSERT INTO public.habit_definitions (name, day_start, day_end, icon, is_bonus, visual_key, plate_zone, explanation)
SELECT '80% מהזמן אוכלים בריא', 71, 126, 'apple', false, NULL, 'side', 'פחות ממה שמשמין, בלי לוותר עליו לגמרי'
WHERE NOT EXISTS (SELECT 1 FROM public.habit_definitions WHERE user_id IS NULL AND name LIKE '%80\%%' AND day_end IS DISTINCT FROM 0);

UPDATE public.habit_definitions
SET day_start = 127, day_end = NULL
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0 AND name LIKE '%90\%%';

-- "In the oven instead of frying" is part of the 80%: hidden (history kept), named in its explanation.
UPDATE public.habit_definitions
SET day_end = 0
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0 AND name ILIKE '%תנור%';
UPDATE public.habit_definitions
SET explanation = 'פחות ממה שמשמין, בלי לוותר עליו לגמרי. למשל: בתנור במקום טיגון'
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0 AND name LIKE '%80\%%';

-- Protein and vegetables at every meal: until day 70 (from 71 the plate in thirds holds both).
UPDATE public.habit_definitions
SET day_end = 70
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0
  AND (name ILIKE '%חלבון בכל ארוחה%' OR name ILIKE '%ירקות בכל ארוחה%');

-- The program weeks of the changed habits (day 1–7 = week 1).
UPDATE public.habit_definitions
SET week_start = ((day_start - 1) / 7) + 1,
    week_end = CASE WHEN day_end IS NULL THEN NULL ELSE ((day_end - 1) / 7) + 1 END
WHERE user_id IS NULL AND day_end IS DISTINCT FROM 0
  AND (name ILIKE '%שליש%' OR name ILIKE '%רוטב%' OR name LIKE '%80\%%' OR name LIKE '%90\%%'
       OR name ILIKE '%חלבון בכל ארוחה%' OR name ILIKE '%ירקות בכל ארוחה%');

-- 4. The video's name.
UPDATE public.program_content
SET title = 'שבועות 11–12: שליש-שליש-שליש, רוטב אחד ביום ו-80% בריא'
WHERE content_type = 'video' AND archived_at IS NULL AND title LIKE 'שבועות 11–12:%';

-- 5. The healthy-eating guide and the shopping list open with that video (day 71), right after it.
UPDATE public.program_content c
SET unlock_day = 71, week_range = 'שבועות 11–12', part_number = 2,
    sort_order = v.sort_order + CASE WHEN c.title = 'מדריך: תזונה בריאה' THEN 1 ELSE 2 END
FROM (SELECT sort_order FROM public.program_content
      WHERE content_type = 'video' AND archived_at IS NULL AND title LIKE 'שבועות 11–12:%' LIMIT 1) v
WHERE c.archived_at IS NULL
  AND (c.title = 'מדריך: תזונה בריאה' OR c.body @> '[{"type": "shopping_list"}]'::jsonb);

-- The bot's video chunks carry the new name (if the bot's knowledge is already loaded).
DO $$
BEGIN
  IF to_regclass('public.bot_knowledge') IS NOT NULL THEN
    UPDATE public.bot_knowledge b SET title = c.title
    FROM public.program_content c
    WHERE b.content_id = c.id AND b.source = 'video' AND b.title IS DISTINCT FROM c.title;
  END IF;
END $$;

COMMIT;

-- Check: the habits around weeks 4–21, and the week 11–12 content. Return both.
SELECT name, day_start, day_end, visual_key, plate_zone, explanation
FROM public.habit_definitions
WHERE user_id IS NULL
  AND (name ILIKE '%שליש%' OR name ILIKE '%רוטב%' OR name LIKE '%80\%%' OR name LIKE '%90\%%'
       OR name ILIKE '%חלבון בכל ארוחה%' OR name ILIKE '%ירקות בכל ארוחה%' OR name ILIKE '%תנור%')
ORDER BY day_start, name;

SELECT title, content_type, unlock_day, week_range, sort_order
FROM public.program_content
WHERE archived_at IS NULL AND week_range = 'שבועות 11–12'
ORDER BY sort_order;
