-- WhatsApp bot: workout reviews.
--   interview → the bot asks the trainee (in their group) how the workouts go;
--   proposed  → it sent the coach (in private) the improvements it suggests,
--               and talks them over with the coach;
--   applied   → the coach wrote "מאשר": the bot changed the plan;
--   cancelled → dropped (by the coach, or the trainee never answered).
-- For now only the test group.

CREATE TABLE IF NOT EXISTS public.bot_workout_reviews (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id       TEXT NOT NULL,                       -- the trainee's group
  reason        TEXT NOT NULL CHECK (reason IN ('scheduled', 'client', 'coach')),
  status        TEXT NOT NULL DEFAULT 'interview' CHECK (status IN ('interview', 'proposed', 'applied', 'cancelled')),
  coach_chat    TEXT,                                -- the coach's private chat ("972…@c.us")
  findings      TEXT,                                -- what came up with the trainee
  changes       JSONB,                               -- the changes as last agreed / suggested
  refs          JSONB,                               -- E1/D1 → plan ids, for those changes
  result        TEXT,                                -- what was changed in the end
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_at   TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_workout_reviews_user ON public.bot_workout_reviews (user_id, started_at DESC);
-- One open review per trainee.
CREATE UNIQUE INDEX IF NOT EXISTS bot_workout_reviews_one_open ON public.bot_workout_reviews (user_id) WHERE status IN ('interview', 'proposed');

ALTER TABLE public.bot_workout_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read workout reviews" ON public.bot_workout_reviews;
CREATE POLICY "Admins read workout reviews" ON public.bot_workout_reviews FOR SELECT USING (public.is_admin());

-- The scheduled review opens as a message the bot starts.
ALTER TABLE public.bot_proactive DROP CONSTRAINT IF EXISTS bot_proactive_kind_check;
ALTER TABLE public.bot_proactive ADD CONSTRAINT bot_proactive_kind_check
  CHECK (kind IN ('checkin', 'after', 'friday', 'shabbat', 'workout_review'));

-- Check: true, true. Return this.
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bot_workout_reviews') AS reviews_table,
  pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'bot_proactive_kind_check')) LIKE '%workout_review%' AS proactive_kind;
