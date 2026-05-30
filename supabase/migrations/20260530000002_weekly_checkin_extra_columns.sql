-- Add 5 extra free-text columns to weekly_checkin for admin-defined custom questions.
-- column_key values extra_q1..extra_q5 are reserved for questions added via the admin panel.

ALTER TABLE public.weekly_checkin
  ADD COLUMN IF NOT EXISTS extra_q1 TEXT,
  ADD COLUMN IF NOT EXISTS extra_q2 TEXT,
  ADD COLUMN IF NOT EXISTS extra_q3 TEXT,
  ADD COLUMN IF NOT EXISTS extra_q4 TEXT,
  ADD COLUMN IF NOT EXISTS extra_q5 TEXT;
