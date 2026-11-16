-- =============================================================================
-- The client profile (what the bot knows about each trainee) is updated every night,
-- for whoever wrote in their group since the last update (bot-jobs: job 'profiles').
-- It was once a week, on Saturday night.
-- 22:00 UTC = midnight / 1 AM in Israel. Safe to run more than once.
-- =============================================================================
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'bot-profiles';
SELECT cron.schedule('bot-profiles', '0 22 * * *', $$SELECT public.trigger_bot_job('profiles')$$);

-- Check: 0 22 * * *. Return this.
SELECT schedule FROM cron.job WHERE jobname = 'bot-profiles';
