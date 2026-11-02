-- =============================================================================
-- The program length: 36 weeks (252 days) for everyone on the old 168-day default.
-- Paste into the Supabase SQL Editor and run. Safe to run more than once.
-- =============================================================================
BEGIN;

ALTER TABLE public.profiles ALTER COLUMN plan_duration_days SET DEFAULT 252;
UPDATE public.profiles SET plan_duration_days = 252 WHERE plan_duration_days = 168;

COMMIT;

-- Check: how many trainees on each length. Return this table: nobody should be on 168.
SELECT plan_duration_days, count(*) AS trainees FROM public.profiles GROUP BY plan_duration_days ORDER BY plan_duration_days;
