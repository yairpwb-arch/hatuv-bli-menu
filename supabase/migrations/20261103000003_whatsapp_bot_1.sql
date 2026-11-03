-- =============================================================================
-- WhatsApp bot, stage 1: which group is whose, every message, and the bot's
-- own settings. The bot lives only in WhatsApp (Green API); the app is just
-- where its data comes from. Admins only, everywhere: trainees never see this.
-- Safe to run more than once.
-- =============================================================================

-- ── 1. The trainees' groups (the bot is a member of each) ───────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     TEXT NOT NULL UNIQUE,              -- Green API group id, ends in @g.us
  name        TEXT,                              -- the group's name in WhatsApp, for the dashboard
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bot_enabled BOOLEAN NOT NULL DEFAULT false,
  draft_mode  BOOLEAN NOT NULL DEFAULT true,     -- answers go to us as drafts, not to the group
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One group per trainee.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_groups_user_id_key
  ON public.whatsapp_groups (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage whatsapp groups" ON public.whatsapp_groups;
CREATE POLICY "Admins manage whatsapp groups" ON public.whatsapp_groups
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 2. Every message in and out ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       TEXT NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- the group's trainee
  sender        TEXT NOT NULL CHECK (sender IN ('client', 'coach', 'bot')),
  sender_phone  TEXT,                            -- digits only, e.g. 972501234567
  sender_name   TEXT,
  text          TEXT,
  type          TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'other')),
  media_url     TEXT,                            -- Green API's download link (temporary)
  wa_message_id TEXT UNIQUE,                     -- Green API idMessage: a retried webhook isn't saved twice
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_chat_time ON public.whatsapp_messages (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_user_time ON public.whatsapp_messages (user_id, created_at DESC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Admins read whatsapp messages" ON public.whatsapp_messages
  FOR SELECT USING (public.is_admin());
-- Written only by the webhook (service role, which RLS doesn't stop).

-- ── 3. The bot's settings (not app_settings: every trainee can read that one) ──
CREATE TABLE IF NOT EXISTS public.bot_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage bot settings" ON public.bot_settings;
CREATE POLICY "Admins manage bot settings" ON public.bot_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- coach_phones: our numbers (the coaches). A message from one of them is "coach".
-- alert_phones: where alerts and drafts go, in a private chat from the bot.
-- Digits in international form (05x → 9725x). Add more numbers to either list later.
INSERT INTO public.bot_settings (key, value) VALUES
  ('coach_phones', '["972506565742", "972586678676"]'::jsonb),
  ('alert_phones', '["972506565742"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.whatsapp_groups IS 'WhatsApp bot: one group per trainee (us + trainee + the bot number).';
COMMENT ON TABLE public.whatsapp_messages IS 'WhatsApp bot: every message in and out of the groups it knows.';
COMMENT ON TABLE public.bot_settings IS 'WhatsApp bot settings: coach_phones, alert_phones, …';

-- Check: the three tables and the two settings. Return this.
SELECT 'tables' AS what, string_agg(table_name, ', ' ORDER BY table_name) AS value
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('whatsapp_groups', 'whatsapp_messages', 'bot_settings')
UNION ALL
SELECT key, value::text FROM public.bot_settings WHERE key IN ('coach_phones', 'alert_phones');
