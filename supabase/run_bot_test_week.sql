-- WhatsApp bot: a week of testing in the test group, in real roles.
--   Zygier (972586678676) = the coach; Yair (0506565742) = the client.
--   The test group is mapped to Yair's account, so the bot uses real data.
--   Alerts and drafts go to Zygier only while testing.
-- Real groups: nothing changes (the functions answer and send only in TEST_GROUP_ID).
-- Run once in the SQL Editor. Safe to run again.

-- ── 1. Roles in the test group ────────────────────────────────────────────────
INSERT INTO public.bot_settings (key, value) VALUES
  ('test_group', '{"coach_phones": ["972586678676"], "alert_phones": ["972586678676"]}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ── 2. The test group → Yair's account, bot on, answers to the group ─────────
INSERT INTO public.whatsapp_groups (chat_id, name, user_id, bot_enabled, draft_mode)
SELECT '120363429658124625@g.us', 'קבוצת ניסיון', u.id, true, false
FROM auth.users u WHERE lower(u.email) = 'yairpwb@gmail.com'
ON CONFLICT (chat_id) DO UPDATE
  SET user_id = EXCLUDED.user_id, bot_enabled = true, draft_mode = false;

-- ── 3. A new conversation waits 5 minutes (answered by bot-jobs 'replies') ────
CREATE TABLE IF NOT EXISTS public.bot_pending_replies (
  chat_id    TEXT PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  first_at   TIMESTAMPTZ NOT NULL,             -- the client's first message
  due_at     TIMESTAMPTZ NOT NULL,             -- first_at + 5 minutes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_pending_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read pending replies" ON public.bot_pending_replies;
CREATE POLICY "Admins read pending replies" ON public.bot_pending_replies
  FOR SELECT USING (public.is_admin());

-- ── 4. Messages the bot started (max 2 a day, and what was sent) ─────────────
CREATE TABLE IF NOT EXISTS public.bot_proactive (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL CHECK (kind IN ('checkin', 'after', 'friday', 'shabbat')),
  text    TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_proactive_chat_sent ON public.bot_proactive (chat_id, sent_at DESC);
ALTER TABLE public.bot_proactive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read proactive" ON public.bot_proactive;
CREATE POLICY "Admins read proactive" ON public.bot_proactive
  FOR SELECT USING (public.is_admin());

-- ── 5. Jobs ───────────────────────────────────────────────────────────────────
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('bot-replies', 'bot-proactive');
-- Waiting replies: every minute.
SELECT cron.schedule('bot-replies', '* * * * *', $$SELECT public.trigger_bot_job('replies')$$);
-- Messages the bot starts: every 15 minutes (the function checks the time, Shabbat, sleep and limits).
SELECT cron.schedule('bot-proactive', '*/15 * * * *', $$SELECT public.trigger_bot_job('proactive')$$);

-- Check. Return this.
SELECT
  (SELECT value FROM public.bot_settings WHERE key = 'test_group') AS test_group,                         -- Zygier only
  (SELECT user_id IS NOT NULL AND bot_enabled AND NOT draft_mode FROM public.whatsapp_groups
     WHERE chat_id = '120363429658124625@g.us') AS test_group_ready,                                       -- true
  (SELECT count(*) FROM public.whatsapp_groups WHERE bot_enabled AND chat_id <> '120363429658124625@g.us') AS other_groups_on, -- 0
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('bot_pending_replies', 'bot_proactive')) AS new_tables,                            -- 2
  (SELECT string_agg(jobname, ', ' ORDER BY jobname) FROM cron.job WHERE jobname LIKE 'bot-%') AS jobs;    -- + bot-proactive, bot-replies
