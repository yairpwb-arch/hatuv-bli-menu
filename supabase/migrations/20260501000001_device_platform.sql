-- Add device_platform to profiles so the Edge Function can route
-- to the correct OneSignal token field (include_ios_tokens vs include_android_reg_ids)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_platform TEXT;
