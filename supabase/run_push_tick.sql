-- =============================================================================
-- Notifications: one job every 15 minutes in place of the old schedules.
-- (The old weigh-in reminder ran on Thursdays and was never sent; the others
-- sent notifications no longer wanted.) Each notification's time is checked in
-- the trainee's own clock by the push-notification function.
-- Run AFTER the function is deployed. Safe to run more than once.
-- =============================================================================
SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN ('push-daily-quote', 'push-new-habits', 'push-phase-check', 'push-survey-friday', 'push-survey-saturday', 'push-weigh-reminder', 'push-tick');

SELECT cron.schedule('push-tick', '*/15 * * * *', $$SELECT public.trigger_push_notification('tick')$$);

-- Check: one job, push-tick. Return this.
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
