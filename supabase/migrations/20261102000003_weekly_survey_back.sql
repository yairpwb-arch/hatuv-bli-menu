-- =============================================================================
-- The weekly survey is back: its questions switched on again (answers were kept).
-- Paste into the Supabase SQL Editor and run. Safe to run more than once.
-- =============================================================================
UPDATE public.checkin_questions SET is_active = true;

-- Check: how many questions are on. Return this.
SELECT count(*) AS active_questions FROM public.checkin_questions WHERE is_active;
