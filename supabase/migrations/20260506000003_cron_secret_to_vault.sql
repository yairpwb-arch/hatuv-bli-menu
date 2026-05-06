-- Moves the CRON_SECRET from public.app_settings (readable by all logged-in users)
-- into Supabase Vault (encrypted, accessible only via SECURITY DEFINER function).
--
-- MANUAL STEP required in Supabase Dashboard BEFORE deploying this migration:
--   Dashboard → Settings → Vault → Add a new secret
--     Name:  CRON_SECRET
--     Value: d798837635e9018dd784a5829cd77abde204bb79a5243d84
--   (or generate a new random secret and update PUSH_CRON_SECRET in Edge Function Secrets too)

-- 1. Helper function that the cron job's trigger_push_notification can call
--    to read from Vault without granting direct vault access to the postgres role.
CREATE OR REPLACE FUNCTION public.get_vault_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name
  LIMIT 1;
  RETURN v_secret;
END;
$$;

-- 2. Update trigger_push_notification to read secret from Vault instead of app_settings
CREATE OR REPLACE FUNCTION public.trigger_push_notification(notification_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url FROM public.app_settings WHERE key = 'push_notification_url';
  v_secret := public.get_vault_secret('CRON_SECRET');

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE LOG '[push-notification] Missing config: push_notification_url or CRON_SECRET vault secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', v_secret
               ),
    body    := jsonb_build_object('type', notification_type)
  );
END;
$$;

-- 3. Remove push_cron_secret from app_settings — it is no longer needed there
--    and was readable by every logged-in user.
DELETE FROM public.app_settings WHERE key = 'push_cron_secret';
