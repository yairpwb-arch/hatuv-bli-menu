-- =============================================================================
-- Week 1 is missing from the app's content too: bring it back, as program v2 has it.
-- It opens the first walk (walk_1), so without it no one gets their first walk.
--   * archived → back, the same row (the trainees' "watched" marks kept);
--   * deleted → a new row: the same title, text, day, video and what it opens;
--   * the bot's knowledge of the video points at it again.
-- Paste into the SQL Editor and run. Safe to run more than once.
-- =============================================================================
BEGIN;

-- 1. Archived: un-archive the latest one (only if no active week 1 exists).
UPDATE public.program_content c
SET archived_at = NULL
WHERE c.id = (
  SELECT id FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 1:%' AND archived_at IS NOT NULL
  ORDER BY archived_at DESC LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 1:%' AND archived_at IS NULL
);

-- 2. Deleted: a new one.
INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order)
SELECT 1, 'שבוע 1', 1, 'שבוע 1: מים לפני האוכל והליכה ראשונה',
       '2 כוסות מים לפני ארוחה גדולה · כוס מים לפני ארוחה קטנה, נשנוש או מתוק · הליכה פעם בשבוע, 20–30 דקות (מסמנים באפליקציה את יום ההליכה).',
       'video', false, 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 1:%' AND archived_at IS NULL
);

-- 3. Its place, its video and what it opens.
UPDATE public.program_content
SET part_number = 1,
    week_range  = 'שבוע 1',
    unlock_day  = 1,
    is_bonus    = false,
    video_url   = COALESCE(NULLIF(video_url, ''), 'bunny:b451f783-5660-4a07-81b8-e180258e6737'),
    unlocks     = 'walk_1'
WHERE content_type = 'video' AND title LIKE 'שבוע 1:%' AND archived_at IS NULL;

-- 4. The bot's knowledge of the week 1 video: pointed at it again.
UPDATE public.bot_knowledge k
SET content_id = c.id, title = c.title, unlock_day = c.unlock_day
FROM (
  SELECT id, title, unlock_day FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 1:%' AND archived_at IS NULL
  ORDER BY sort_order LIMIT 1
) c
WHERE k.source = 'video'
  AND (k.title LIKE 'שבוע 1:%' OR k.title = 'סרטון: שבוע 1'
       OR k.content_id IN (SELECT id FROM public.program_content WHERE title LIKE 'שבוע 1:%'));

COMMIT;

-- Check 1: what opens the walks and workouts. Expected 4 rows: walk_1 (week 1), walk_2 (week 4),
-- workout_1 (weeks 5–6), workout_2 (weeks 9–10). A missing one = that video is missing too.
SELECT unlocks, title, unlock_day FROM public.program_content
WHERE unlocks IS NOT NULL AND archived_at IS NULL ORDER BY unlock_day;
