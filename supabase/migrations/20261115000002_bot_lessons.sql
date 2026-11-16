-- =============================================================================
-- The bot learns from the coaches (whatsapp-webhook/lessons.ts):
--   1. A coach tells the bot in private how to answer ("אל תענה ככה", "מעכשיו…").
--   2. A coach writes in a group right after the bot, correcting or adding to it.
-- Each becomes a lesson: a short rule that goes into every answer of the bot,
-- until a coach writes "בטל" or switches it off in the admin (הבוט → לקחים).
--
-- And both coaches talk to the bot in private: the test group's alerts go to both
-- (its coach_phones stay as they are: in the test group, the owner plays the client).
--
-- Run BEFORE deploying whatsapp-webhook and bot-jobs. Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bot_lessons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson      TEXT NOT NULL,                      -- the rule, as the bot reads it
  source      TEXT NOT NULL CHECK (source IN ('private', 'group', 'admin')),
  coach_phone TEXT,                               -- who taught it
  chat_id     TEXT,                               -- the group it came from (a group lesson)
  example     JSONB,                              -- {client, bot, coach}: what happened
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_lessons_active ON public.bot_lessons (active, created_at DESC);
ALTER TABLE public.bot_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage lessons" ON public.bot_lessons;
CREATE POLICY "Admins manage lessons" ON public.bot_lessons
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Both coaches (all of coach_phones) get the test group's alerts and talk to the bot in private.
UPDATE public.bot_settings
SET value = jsonb_set(value, '{alert_phones}', (SELECT value FROM public.bot_settings WHERE key = 'coach_phones')),
    updated_at = now()
WHERE key = 'test_group';

-- The bot's "חבר מביא חבר" message every 3 months (bot-jobs/talk.ts, kind 'referral').
ALTER TABLE public.bot_proactive DROP CONSTRAINT IF EXISTS bot_proactive_kind_check;
ALTER TABLE public.bot_proactive ADD CONSTRAINT bot_proactive_kind_check
  CHECK (kind IN ('checkin', 'after', 'friday', 'shabbat', 'workout_review', 'content', 'referral'));

-- Check: lessons_table true, referral_kind true, and the phones. Return this.
SELECT to_regclass('public.bot_lessons') IS NOT NULL AS lessons_table,
       pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'bot_proactive_kind_check')) LIKE '%referral%' AS referral_kind,
       (SELECT value::text FROM public.bot_settings WHERE key = 'coach_phones') AS coaches,
       (SELECT value::text FROM public.bot_settings WHERE key = 'test_group') AS test_group;
