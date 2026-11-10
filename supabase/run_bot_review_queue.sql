-- Workout reviews: a queue for the coach. A proposal waits (sent_at NULL) until
-- the coach finishes the one before it; then it's sent and sent_at is set.

ALTER TABLE public.bot_workout_reviews ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
-- Proposals already open were already sent.
UPDATE public.bot_workout_reviews SET sent_at = proposed_at WHERE status = 'proposed' AND sent_at IS NULL;

-- Check: true. Return this.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'bot_workout_reviews' AND column_name = 'sent_at'
) AS queue_column;
