-- Referral leads table: "חבר מביא חבר"
CREATE TABLE IF NOT EXISTS public.referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_name   TEXT NOT NULL,
  friend_phone  TEXT NOT NULL,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | contacted | converted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can insert their own referrals
CREATE POLICY "users_insert_own_referrals" ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_id = auth.uid());

-- Users can view their own referrals
CREATE POLICY "users_select_own_referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());

-- Admins can view all referrals
CREATE POLICY "admins_select_all_referrals" ON public.referrals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND email = 'yairpwb@gmail.com'
    )
  );
