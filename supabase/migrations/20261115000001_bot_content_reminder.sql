-- =============================================================================
-- The bot's reminder to watch the stage's video (bot-jobs/talk.ts, kind 'content'):
-- a message kind of its own, so it's logged and sent once a stage.
-- Run BEFORE deploying bot-jobs (otherwise the message isn't logged and repeats).
-- Safe to run more than once.
-- =============================================================================
ALTER TABLE public.bot_proactive DROP CONSTRAINT IF EXISTS bot_proactive_kind_check;
ALTER TABLE public.bot_proactive ADD CONSTRAINT bot_proactive_kind_check
  CHECK (kind IN ('checkin', 'after', 'friday', 'shabbat', 'workout_review', 'content'));

-- Check: true. Return this.
SELECT pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'bot_proactive_kind_check')) LIKE '%content%' AS content_kind;
