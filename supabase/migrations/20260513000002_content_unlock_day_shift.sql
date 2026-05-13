-- Subtract 7 from unlock_day for all program_content rows at week 3 or later.
-- Week 3 starts at day 15 (weeks 1-2 are days 1-14).
UPDATE public.program_content
SET unlock_day = unlock_day - 7
WHERE unlock_day >= 15;
