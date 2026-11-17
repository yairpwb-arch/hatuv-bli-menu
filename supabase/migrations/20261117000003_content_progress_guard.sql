-- Trainees never go back a stage.
-- On 14.11 weeks 1 and 4 were deleted and created again: the delete took every trainee's
-- "watched" mark with it (ON DELETE CASCADE), and since a week opens only once the one before
-- it is all watched, everyone after week 1 was locked back. The marks were restored on 17.11.

-- 1. Content with watched marks can't be deleted (the admin archives it instead).
ALTER TABLE public.content_progress DROP CONSTRAINT IF EXISTS content_progress_content_id_fkey;
ALTER TABLE public.content_progress
  ADD CONSTRAINT content_progress_content_id_fkey
  FOREIGN KEY (content_id) REFERENCES public.program_content(id) ON DELETE RESTRICT;

-- 2. Content added (or brought back) into a week a trainee is already past counts as watched
--    for him, so it doesn't lock what he reached. (The app from the next version doesn't lock
--    on it either; this covers the versions already installed.)
CREATE OR REPLACE FUNCTION public.mark_past_content_watched()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.content_progress (user_id, content_id)
  SELECT DISTINCT cp.user_id, NEW.id
  FROM public.content_progress cp
  JOIN public.program_content c ON c.id = cp.content_id
  WHERE c.archived_at IS NULL
    AND c.id <> NEW.id
    AND c.week_range IS DISTINCT FROM NEW.week_range
    AND c.sort_order > NEW.sort_order
  ON CONFLICT (user_id, content_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_past_content_watched ON public.program_content;
CREATE TRIGGER trg_mark_past_content_watched
  AFTER INSERT OR UPDATE OF archived_at, sort_order, week_range ON public.program_content
  FOR EACH ROW EXECUTE FUNCTION public.mark_past_content_watched();

SELECT pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'content_progress_content_id_fkey')) AS fk,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mark_past_content_watched') AS trigger_on;
