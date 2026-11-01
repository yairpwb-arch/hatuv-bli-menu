-- =============================================================================
-- Content fixes (2026-11-01). Paste into the Supabase SQL Editor and run.
-- Safe to run more than once.
-- =============================================================================

BEGIN;

-- 1. "ספר הנשנושים" off the content map: it already has its own button at the
--    top of the page. Archived (hidden everywhere) rather than deleted, so
--    trainees' progress rows don't cascade away.
UPDATE public.program_content
SET archived_at = now()
WHERE title = 'ספר הנשנושים' AND archived_at IS NULL;

-- 2. The opening, all on day 1 in this order: מנטליות הרגלים (new guide, first) →
--    ברוכים הבאים → איך להישקל →
--    אני חולה → צימוד הרגלים → העלאת זמינות (moved here from week 2).
UPDATE public.program_content c
SET sort_order = v.sort_order, week_range = 'פתיחה', unlock_day = 1, part_number = 1
FROM (VALUES
  ('ברוכים הבאים: סוויץ'' במוח',   10),
  ('מדריך: איך להישקל',            11),
  ('מדריך: אני חולה, מה עושים?',   13),
  ('סרטון העשרה: צימוד הרגלים',    14),
  ('סרטון העשרה: העלאת זמינות',    15)
) AS v(title, sort_order)
WHERE c.title = v.title AND c.archived_at IS NULL;

INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order, category)
SELECT 1, 'פתיחה', 1, 'מדריך: מנטליות הרגלים', 'איך חושבים על הרגלים, ולמה שינוי קטן מחזיק לאורך זמן.', 'guide', false, 5, 'sleep'
WHERE NOT EXISTS (SELECT 1 FROM public.program_content WHERE title = 'מדריך: מנטליות הרגלים' AND archived_at IS NULL);

-- 3. Each part opens with its own video, on the day of its first week:
--    part video → the part's guides → the week's video.
--    The week items that carried the part's name get the week's name.
UPDATE public.program_content SET title = 'שבועות 5–6: סידור ארוחות, אימון וחלבון', sort_order = 63
WHERE title = 'חלק 2: סידור ארוחות, אימון וחלבון';
UPDATE public.program_content SET title = 'שבועות 13–15: משפרים את מה שכבר קיים'
WHERE title = 'חלק 3: משפרים את מה שכבר קיים';
UPDATE public.program_content SET title = 'שבועות 25–28: מדרגים ומשפרים'
WHERE title = 'חלק 4: המאמנים של עצמכם' AND sort_order = 140;

INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order, video_url)
SELECT v.part_number, v.week_range, v.unlock_day, v.title, v.description, 'video', false, v.sort_order, v.video_url
FROM (VALUES
  (2, 'שבועות 5–6',   29,  'חלק 2: מוסיפים ומשפרים',  'פותחים את החלק השני: מה מחכה לכם בשבועות 5–12.',  55,  'bunny:b970ea23-95c8-4dd0-9ddc-e9b8aef687be'),
  (3, 'שבועות 13–15', 85,  'חלק 3: מדייקים את ההרגלים', 'פותחים את החלק השלישי: מה מחכה לכם בשבועות 13–24.', 95,  'bunny:c2efc102-57ae-48e9-ac98-94f2b94c4a2a'),
  (4, 'שבועות 25–28', 169, 'חלק 4: המאמנים של עצמכם',  'פותחים את החלק הרביעי: מה מחכה לכם בשבועות 25–36.', 135, 'bunny:3e78d609-685b-4ce8-9cab-2b83f5c1b517')
) AS v(part_number, week_range, unlock_day, title, description, sort_order, video_url)
WHERE NOT EXISTS (SELECT 1 FROM public.program_content c WHERE c.title = v.title AND c.archived_at IS NULL);

-- Trainees already past the opening / a part's opening by more than a week: the new item
-- counts as watched, so the step-by-step gate doesn't send them back.
INSERT INTO public.content_progress (user_id, content_id)
SELECT p.id, c.id
FROM public.profiles p
JOIN public.program_content c ON c.archived_at IS NULL AND c.sort_order IN (5, 55, 95, 135)
WHERE p.start_date IS NOT NULL
  AND c.unlock_day + 7 <= (CURRENT_DATE - p.start_date) + 1
  AND NOT EXISTS (SELECT 1 FROM public.content_progress cp WHERE cp.user_id = p.id AND cp.content_id = c.id);

COMMIT;

-- Check: the whole map in order. 32 rows; every video row with ok = true. Return this table.
SELECT sort_order, week_range, content_type, title,
       CASE WHEN content_type = 'video' THEN video_url LIKE 'bunny:%' END AS ok
FROM public.program_content
WHERE archived_at IS NULL
ORDER BY unlock_day, sort_order;
