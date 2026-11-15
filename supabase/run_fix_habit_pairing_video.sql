-- =============================================================================
-- "סרטון העשרה: צימוד הרגלים" pointed at a Bunny video that no longer exists
-- (3769e5ee-…, 404). It was uploaded again: the new one. Paste into the SQL Editor and run.
-- =============================================================================
UPDATE public.program_content
SET video_url = 'bunny:a2506413-a1b7-4899-931d-f645af274d04'
WHERE title = 'סרטון העשרה: צימוד הרגלים' AND content_type = 'video';

-- Check: one row, the new link. Return this.
SELECT title, video_url, archived_at FROM public.program_content WHERE title = 'סרטון העשרה: צימוד הרגלים';
