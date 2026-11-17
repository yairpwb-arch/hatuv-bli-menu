-- Walks by stage, for everyone: the first walk from day 1, the second from the stage of its video
-- (program_content.unlocks = 'walk_2', day 22 = week 4). Until now a walk was added only when the
-- trainee watched its video and opened the workouts page in the app.
-- A walk a coach turned off (is_active = false) stays off: existing rows are never touched.

CREATE OR REPLACE FUNCTION public.ensure_walks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  walk2_day int := COALESCE(
    (SELECT min(unlock_day) FROM public.program_content WHERE unlocks = 'walk_2' AND archived_at IS NULL), 22);
  added int;
BEGIN
  WITH due AS (
    SELECT p.id AS user_id, w.n AS walk_number, CASE w.n WHEN 1 THEN 1 ELSE 4 END AS week_start
    FROM public.profiles p
    CROSS JOIN (VALUES (1), (2)) AS w(n)
    WHERE p.start_date IS NOT NULL
      AND COALESCE(p.is_active, true)
      AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
      AND (today - p.start_date + 1) >= CASE w.n WHEN 1 THEN 1 ELSE walk2_day END
  ),
  ins AS (
    INSERT INTO public.user_walking_schedule (user_id, walk_number, week_start)
    SELECT user_id, walk_number, week_start FROM due
    ON CONFLICT (user_id, walk_number) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO added FROM ins;
  RETURN added;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_walks() FROM PUBLIC, anon, authenticated;

-- Every night just after midnight Israel time (22:05 UTC: 00:05 in winter, 01:05 in summer).
SELECT cron.unschedule('ensure-walks') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-walks');
SELECT cron.schedule('ensure-walks', '5 22 * * *', $$SELECT public.ensure_walks()$$);

-- The bot's review of the weekly survey right after it's filled.
ALTER TABLE public.bot_proactive DROP CONSTRAINT IF EXISTS bot_proactive_kind_check;
ALTER TABLE public.bot_proactive ADD CONSTRAINT bot_proactive_kind_check
  CHECK (kind IN ('checkin', 'after', 'friday', 'shabbat', 'workout_review', 'content', 'referral', 'survey', 'days'));

-- Now, for everyone who's already there.
SELECT public.ensure_walks() AS walks_added_now;
