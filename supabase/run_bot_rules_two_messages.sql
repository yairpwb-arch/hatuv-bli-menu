-- WhatsApp bot rules: at most 2 messages per answer (was "usually 1–2, at most 3").
-- The old version is kept in bot_settings_history (trigger). Run once; safe to run again.

UPDATE public.bot_settings
SET value = to_jsonb(replace(value #>> '{}',
      'בדרך כלל 1–2 הודעות קצרות, לכל היותר 3.',
      'לכל היותר 2 הודעות קצרות, ולרוב אחת מספיקה.')),
    updated_at = now()
WHERE key = 'rules'
  AND position('בדרך כלל 1–2 הודעות קצרות, לכל היותר 3.' IN value #>> '{}') > 0;

-- Check (true, false). Return this.
SELECT
  position('לכל היותר 2 הודעות קצרות' IN value #>> '{}') > 0 AS two_max,
  position('לכל היותר 3' IN value #>> '{}') > 0 AS old_three_left
FROM public.bot_settings WHERE key = 'rules';
