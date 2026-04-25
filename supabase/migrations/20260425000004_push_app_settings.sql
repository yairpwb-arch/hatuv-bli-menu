-- =====================================================
-- Push notification configuration in app_settings
-- =====================================================

INSERT INTO public.app_settings (key, value)
VALUES
  ('push_notification_url',
   'https://bwndknbkchspvottwyho.supabase.co/functions/v1/push-notification'),
  ('push_cron_secret',
   'd798837635e9018dd784a5829cd77abde204bb79a5243d84')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
