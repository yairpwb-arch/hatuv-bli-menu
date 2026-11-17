-- Each exercise's video: its guid in the Bunny collection "Exercise" (library 795868).
-- The only media from now on; media_url (GIFs from outside sites) was cleared.
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_id TEXT;
COMMENT ON COLUMN public.exercises.video_id IS 'Bunny Stream video guid (collection "Exercise"); played as a muted loop.';

SELECT count(*) AS exercises, count(video_id) AS with_video FROM public.exercises;
