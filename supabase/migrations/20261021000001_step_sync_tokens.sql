-- Background step sync without the user's login session.
--
-- The native background code (Android foreground service / iOS HealthKit
-- wake-ups) used to upload steps with the user's JWT access token, which
-- expires after ~1 hour — so every background upload silently failed unless
-- the app had been opened recently, and days the user didn't open the app
-- were never recorded. Instead, each device registers a long-lived random
-- sync token (only its SHA-256 hash is stored) and uploads through a
-- SECURITY DEFINER function that maps the token to its user.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.step_sync_devices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- No policies: the table is only reachable through the functions below.
ALTER TABLE public.step_sync_devices ENABLE ROW LEVEL SECURITY;

-- Called by the logged-in app once per device. Returns the plain token.
CREATE OR REPLACE FUNCTION public.register_step_sync_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.step_sync_devices (user_id, token_hash)
  VALUES (auth.uid(), encode(extensions.digest(v_token, 'sha256'), 'hex'));

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.register_step_sync_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_step_sync_token() TO authenticated;

-- Called from the background (anon key + token) and from the app itself.
-- p_entries: [{"date":"YYYY-MM-DD","steps":1234}, ...]
-- A day's count only ever goes up, so a stale/partial upload from one source
-- can never overwrite a higher count already recorded.
CREATE OR REPLACE FUNCTION public.sync_steps_with_token(p_token TEXT, p_entries JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash  TEXT := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_user  UUID;
  v_entry JSONB;
  v_date  DATE;
  v_steps INT;
  v_count INT := 0;
BEGIN
  SELECT user_id INTO v_user FROM public.step_sync_devices WHERE token_hash = v_hash;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'invalid sync token' USING ERRCODE = '28000';
  END IF;

  UPDATE public.step_sync_devices SET last_used_at = now() WHERE token_hash = v_hash;

  IF jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) > 60 THEN
    RETURN 0;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    BEGIN
      v_date  := (v_entry->>'date')::DATE;
      v_steps := (v_entry->>'steps')::INT;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    CONTINUE WHEN v_date IS NULL OR v_steps IS NULL;
    CONTINUE WHEN v_steps < 0 OR v_steps > 200000;
    CONTINUE WHEN v_date > current_date + 1 OR v_date < current_date - 30;

    INSERT INTO public.steps_log (user_id, date, steps, updated_at)
    VALUES (v_user, v_date, v_steps, now())
    ON CONFLICT (user_id, date) DO UPDATE
      SET steps      = GREATEST(public.steps_log.steps, EXCLUDED.steps),
          updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_steps_with_token(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_steps_with_token(TEXT, JSONB) TO anon, authenticated;
