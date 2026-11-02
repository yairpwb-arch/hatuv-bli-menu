-- =============================================================================
-- The weeks 11-12 video, now in Bunny, onto its stage on the content map.
-- Paste into the Supabase SQL Editor and run. Safe to run more than once.
-- =============================================================================

UPDATE public.program_content
SET video_url = 'bunny:ef145f22-0941-44ec-829e-4e1a22095130'
WHERE title = 'שבועות 11–12: הצלחת המחולקת ודילול' AND content_type = 'video' AND archived_at IS NULL;

-- Check: one row with ok = true. And no video on the map is left without a link: missing = 0.
SELECT title, video_url, video_url = 'bunny:ef145f22-0941-44ec-829e-4e1a22095130' AS ok,
       (SELECT count(*) FROM public.program_content WHERE archived_at IS NULL AND content_type = 'video' AND video_url IS NULL) AS missing
FROM public.program_content
WHERE title = 'שבועות 11–12: הצלחת המחולקת ודילול' AND archived_at IS NULL;
