-- Keep profiles.current_weight automatically in sync with weight_log via a
-- trigger, instead of relying on each client code path to update both tables
-- itself. This fixes two real bugs reported in production:
--
-- 1. A trainee logged a new weigh-in but current_weight in the system stayed
--    stale — traced to AppHome's quick weigh-in dialog, which inserted into
--    weight_log but never checked whether the follow-up profiles update
--    actually succeeded (so a silent failure there still showed "success").
-- 2. Deleting a weigh-in (from the app or the admin panel) only recomputed
--    current_weight client-side from the remaining rows already in memory,
--    which could pick the wrong row when two entries shared the same date,
--    and did nothing at all if the admin DELETE RLS policy wasn't live yet
--    (RLS silently filters instead of erroring, so the row never actually
--    deleted even though the client showed a success toast).
--
-- SECURITY DEFINER so the sync always succeeds regardless of which RLS
-- policy allowed the triggering insert/update/delete (trainee's own session
-- or an admin session).

CREATE OR REPLACE FUNCTION public.sync_current_weight()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user UUID := COALESCE(NEW.user_id, OLD.user_id);
  latest_weight NUMERIC;
BEGIN
  SELECT weight INTO latest_weight
  FROM public.weight_log
  WHERE user_id = affected_user
  ORDER BY recorded_at DESC, created_at DESC
  LIMIT 1;

  UPDATE public.profiles
  SET current_weight = latest_weight
  WHERE id = affected_user;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS weight_log_sync_current_weight ON public.weight_log;

CREATE TRIGGER weight_log_sync_current_weight
AFTER INSERT OR UPDATE OR DELETE ON public.weight_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_current_weight();

-- One-off backfill: fix any profile whose current_weight is already stale
-- relative to their actual latest weigh-in.
UPDATE public.profiles p
SET current_weight = latest.weight
FROM (
  SELECT DISTINCT ON (user_id) user_id, weight
  FROM public.weight_log
  ORDER BY user_id, recorded_at DESC, created_at DESC
) latest
WHERE p.id = latest.user_id
  AND p.current_weight IS DISTINCT FROM latest.weight;
