-- =============================================================================
-- Week 4 is missing from the app's content: bring it back, as program v2 has it.
--   * archived (archived_at set) → back, the same row (the trainees' "watched" marks kept);
--   * deleted → a new row: the same title, text, day, video and what it opens;
--   * either way: its video (Bunny), it opens the second walk (walk_2), and the
--     bot's knowledge of the video points at it again.
-- Paste into the SQL Editor and run. Safe to run more than once.
-- =============================================================================
BEGIN;

-- 1. Archived: un-archive the latest one (only if no active week 4 exists).
UPDATE public.program_content c
SET archived_at = NULL
WHERE c.id = (
  SELECT id FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 4:%' AND archived_at IS NOT NULL
  ORDER BY archived_at DESC LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 4:%' AND archived_at IS NULL
);

-- 2. Deleted: a new one.
INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order)
SELECT 1, 'שבוע 4', 22, 'שבוע 4: צלחת אחת, רוטב אחד ו-2 הליכות',
       '2 הליכות בשבוע · אוכלים בצלחת אחת, בלי ריפילים או נשנושים מהצד · רוטב אחד לכל ארוחה.',
       'video', false, 50
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 4:%' AND archived_at IS NULL
);

-- 3. Its place in the program, its video and what it opens (as the other weeks).
UPDATE public.program_content
SET part_number = 1,
    week_range  = 'שבוע 4',
    unlock_day  = 22,
    is_bonus    = false,
    video_url   = COALESCE(NULLIF(video_url, ''), 'bunny:acf16049-e399-4e84-819b-c90ebe8d3e6f'),
    unlocks     = 'walk_2'
WHERE content_type = 'video' AND title LIKE 'שבוע 4:%' AND archived_at IS NULL;

-- 4. The bot's knowledge of the week 4 video: pointed at it again.
UPDATE public.bot_knowledge k
SET content_id = c.id, title = c.title, unlock_day = c.unlock_day
FROM (
  SELECT id, title, unlock_day FROM public.program_content
  WHERE content_type = 'video' AND title LIKE 'שבוע 4:%' AND archived_at IS NULL
  ORDER BY sort_order LIMIT 1
) c
WHERE k.source = 'video'
  AND (k.title LIKE 'שבוע 4:%' OR k.title = 'סרטון: שבוע 4'
       OR k.content_id IN (SELECT id FROM public.program_content WHERE title LIKE 'שבוע 4:%'));

COMMIT;

-- Check: part 1 as the trainees see it now. Week 4 should be there, day 22, with a video and walk_2.
SELECT sort_order, week_range, title, unlock_day, content_type,
       (video_url IS NOT NULL AND video_url <> '') AS has_video, unlocks
FROM public.program_content
WHERE part_number = 1 AND archived_at IS NULL
ORDER BY sort_order;
