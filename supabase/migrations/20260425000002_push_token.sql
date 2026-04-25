-- =====================================================
-- Add push_token (OneSignal player ID) to profiles
-- Also adds notification_enabled flag
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;
