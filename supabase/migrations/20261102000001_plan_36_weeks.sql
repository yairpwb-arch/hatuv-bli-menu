-- The program is now 36 weeks (252 days): the habits of weeks 25-36 start on
-- days 170 and 226, past the old 168-day default, which capped them away.
-- Only rows on the old default move; a length set by hand stays.
ALTER TABLE public.profiles ALTER COLUMN plan_duration_days SET DEFAULT 252;
UPDATE public.profiles SET plan_duration_days = 252 WHERE plan_duration_days = 168;
