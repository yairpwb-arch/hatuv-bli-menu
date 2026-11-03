-- =============================================================================
-- WhatsApp bot, its knowledge: our past answers (client wrote → coach answered,
-- names and phones removed), searched by similarity for each new message, and
-- the bot's name. The examples themselves are loaded by a separate file kept
-- off git (private/whatsapp-analysis/import-bot-examples.sql).
-- Safe to run more than once.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.bot_examples (
  id         BIGSERIAL PRIMARY KEY,
  context    TEXT,                 -- what we wrote just before, if anything
  client     TEXT NOT NULL,        -- what the client wrote
  coach      TEXT NOT NULL,        -- how we answered
  weekday    TEXT,                 -- א … ש
  hour       INT,
  source     TEXT NOT NULL DEFAULT 'export-2026-11',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_examples_client_trgm ON public.bot_examples USING gin (client gin_trgm_ops);

ALTER TABLE public.bot_examples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage bot examples" ON public.bot_examples;
CREATE POLICY "Admins manage bot examples" ON public.bot_examples
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- The examples closest to a new message (the bot's server function calls this).
CREATE OR REPLACE FUNCTION public.match_bot_examples(q TEXT, k INT DEFAULT 12)
RETURNS SETOF public.bot_examples
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT * FROM public.bot_examples
  ORDER BY similarity(client, q) DESC
  LIMIT k
$$;
REVOKE ALL ON FUNCTION public.match_bot_examples(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_bot_examples(TEXT, INT) TO service_role;

INSERT INTO public.bot_settings (key, value) VALUES
  ('bot_name', '"העוזר הדיגיטלי של חטוב בלי תפריט"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Check. Return this.
SELECT
  (SELECT count(*) FROM public.bot_examples) AS examples,
  (SELECT value #>> '{}' FROM public.bot_settings WHERE key = 'bot_name') AS bot_name,
  (SELECT count(*) FROM pg_proc WHERE proname = 'match_bot_examples') AS search_function;
