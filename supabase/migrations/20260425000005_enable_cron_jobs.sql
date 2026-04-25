-- =====================================================
-- Schedule push-notification cron jobs.
-- pg_cron MUST already be enabled for this to apply.
-- If pg_cron is not yet enabled, this is a safe NO-OP.
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING
      '[push-notification] pg_cron still not enabled — skipping. '
      'Enable it in: https://supabase.com/dashboard/project/bwndknbkchspvottwyho/database/extensions '
      'then run: npx supabase db push';
    RETURN;
  END IF;

  -- Remove old jobs (idempotent)
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

  RAISE NOTICE '[push-notification] ✓ All 6 cron jobs scheduled.';
END;
$$;
