-- Profile / settings / referral redesign.

-- ── 1. Personal referral code ────────────────────────────────────────────────
-- 6 characters, no look-alikes (0/O, 1/I/L), unique per trainee.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code TEXT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;

UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

ALTER TABLE public.profiles ALTER COLUMN referral_code SET DEFAULT public.generate_referral_code();
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);

-- ── 2. Referral status + consent ─────────────────────────────────────────────
-- status keeps its existing values; the app shows them as
--   pending → "נשלח", contacted → "בשיחה", converted → "הצטרף".
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS friend_knows BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'form' CHECK (source IN ('form', 'link'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_status_check') THEN
    ALTER TABLE public.referrals
      -- NOT VALID: checks new rows without failing on any older value already stored.
      ADD CONSTRAINT referrals_status_check CHECK (status IN ('pending', 'contacted', 'converted')) NOT VALID;
  END IF;
END $$;

-- Admin access by role, not by a hard-coded e-mail address.
DROP POLICY IF EXISTS "admins_select_all_referrals" ON public.referrals;
DROP POLICY IF EXISTS "admins_manage_all_referrals" ON public.referrals;
CREATE POLICY "admins_manage_all_referrals" ON public.referrals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── 3. Per-type notification preferences ─────────────────────────────────────
-- Missing keys mean "on". Keys: habits, weigh, workout_walk, weekly_summary, new_content.
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS prefs               JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS habit_reminder_time TIME  NOT NULL DEFAULT '20:00';

-- ── 4. Links shown in settings / referral (empty → row hidden) ──────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('public_site_url', ''),
  ('privacy_policy_url', ''),
  ('terms_url', ''),
  ('support_whatsapp_url', 'https://wa.me/message/IZV5KBE6SSC7B'),
  ('referral_reward', '500 ₪ וחודש ליווי מתנה')
ON CONFLICT (key) DO NOTHING;
