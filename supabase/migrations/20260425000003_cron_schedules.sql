-- =====================================================
-- pg_cron schedules for push notifications
--
-- PREREQUISITES (run in Supabase Dashboard first):
--   1. Database → Extensions → enable "pg_cron"
--   2. Database → Extensions → enable "pg_net"
--   3. Run in SQL editor after enabling extensions:
--
--        INSERT INTO public.app_settings (key, value)
--        VALUES
--          ('push_notification_url',
--           'https://bwndknbkchspvottwyho.supabase.co/functions/v1/push-notification'),
--          ('push_cron_secret', 'REPLACE_WITH_A_RANDOM_SECRET')
--        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- All times are UTC (Israel = UTC+3 summer / UTC+2 winter).
-- This migration is a NO-OP if pg_cron is not yet enabled.
-- =====================================================

-- Helper function: called by each cron job
CREATE OR REPLACE FUNCTION public.trigger_push_notification(notification_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url    FROM public.app_settings WHERE key = 'push_notification_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'push_cron_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE LOG '[push-notification] Missing app_settings: push_notification_url / push_cron_secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', v_secret
               ),
    body    := jsonb_build_object('type', notification_type)
  );
END;
$$;

-- Register cron jobs only if pg_cron is installed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING
      '[push-notification] pg_cron is NOT enabled — cron jobs were NOT created. '
      'Enable it in Supabase Dashboard → Database → Extensions → pg_cron '
      'then re-run this migration.';
    RETURN;
  END IF;

  -- Remove old jobs (ignore if they do not exist yet)
  BEGIN PERFORM cron.unschedule('push-daily-quote');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('push-phase-check');    EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('push-new-habits');     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('push-weigh-reminder'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('push-survey-friday');  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('push-survey-saturday');EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 1. משפט יומי — כל יום ב‑10:00 IST (07:00 UTC קיץ)
  PERFORM cron.schedule(
    'push-daily-quote', '0 7 * * *',
    $cmd$SELECT public.trigger_push_notification('daily_quote')$cmd$
  );

  -- 2. בדיקת סיום שלב — כל שבת ב‑19:00 IST (16:00 UTC קיץ)
  PERFORM cron.schedule(
    'push-phase-check', '0 16 * * 6',
    $cmd$SELECT public.trigger_push_notification('phase_check')$cmd$
  );

  -- 3. הרגלים חדשים — כל ראשון ב‑09:00 IST (06:00 UTC קיץ)
  PERFORM cron.schedule(
    'push-new-habits', '0 6 * * 0',
    $cmd$SELECT public.trigger_push_notification('new_habits')$cmd$
  );

  -- 4. תזכורת שקילה + שאלון — כל חמישי ב‑20:00 IST (17:00 UTC קיץ)
  PERFORM cron.schedule(
    'push-weigh-reminder', '0 17 * * 4',
    $cmd$SELECT public.trigger_push_notification('weigh_reminder')$cmd$
  );

  -- 5א. תזכורת שאלון (ראשונה) — כל שישי ב‑12:00 IST (09:00 UTC קיץ)
  PERFORM cron.schedule(
    'push-survey-friday', '0 9 * * 5',
    $cmd$SELECT public.trigger_push_notification('survey_followup')$cmd$
  );

  -- 5ב. תזכורת שאלון (שנייה) — כל שבת ב‑16:00 IST (13:00 UTC קיץ)
  PERFORM cron.schedule(
    'push-survey-saturday', '0 13 * * 6',
    $cmd$SELECT public.trigger_push_notification('survey_followup')$cmd$
  );

  RAISE NOTICE '[push-notification] All 6 cron jobs scheduled successfully.';
END;
$$;
