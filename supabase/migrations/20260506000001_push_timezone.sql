-- Add timezone to profiles so scheduled-notifications can calculate
-- each user's local time correctly instead of sending at fixed UTC times.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT;
