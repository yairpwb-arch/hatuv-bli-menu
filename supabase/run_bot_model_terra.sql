-- WhatsApp bot: the live model → GPT-6.1 Terra (only after the test passed).
-- The bot answers only in the test group, so this changes the test group only.
-- Back to Sonnet: DELETE FROM public.bot_settings WHERE key = 'model';

INSERT INTO public.bot_settings (key, value) VALUES ('model', to_jsonb('gpt-6.1-terra'::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Check: gpt-6.1-terra. Return this.
SELECT value #>> '{}' AS model FROM public.bot_settings WHERE key = 'model';
