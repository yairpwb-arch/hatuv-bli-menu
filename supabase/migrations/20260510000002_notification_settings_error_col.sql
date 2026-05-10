-- Add registration_error column to capture FCM/APNs registration failures for debugging
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS registration_error TEXT;

-- Enable Realtime so the client can subscribe to changes in this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_settings;
