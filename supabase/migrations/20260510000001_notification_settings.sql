-- =====================================================
-- notification_settings — dedicated table for push tokens
-- Mirrors MassAI architecture: upsert on user_id,
-- separate from profiles to avoid silent update failures.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notification_settings (
  user_id        UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_id      TEXT,                          -- raw APNs (iOS) or FCM (Android) token
  device_platform TEXT,                         -- 'ios' | 'android'
  timezone       TEXT        NOT NULL DEFAULT 'Asia/Jerusalem',
  notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their notification settings"
  ON public.notification_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all notification settings"
  ON public.notification_settings FOR ALL
  USING (is_admin());

-- Migrate existing data: only migrate users who actually have a token
INSERT INTO public.notification_settings (user_id, player_id, device_platform, timezone, notifications_enabled)
SELECT
  p.id,
  p.push_token,
  p.device_platform,
  COALESCE(p.timezone, 'Asia/Jerusalem'),
  CASE WHEN p.push_token IS NOT NULL THEN true ELSE false END
FROM public.profiles p
WHERE p.start_date IS NOT NULL
  AND p.push_token IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Fix the misleading default in profiles (was DEFAULT true — caused toggle to show ON with no token)
ALTER TABLE public.profiles ALTER COLUMN notifications_enabled SET DEFAULT false;

-- Sync profiles.notifications_enabled to match the real state
UPDATE public.profiles SET notifications_enabled = false WHERE push_token IS NULL;
