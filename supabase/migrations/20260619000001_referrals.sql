-- Referral leads table: "חבר מביא חבר"
-- Safe to run more than once. (Admin access is replaced by a role-based
-- policy in 20261029000004.)
CREATE TABLE IF NOT EXISTS public.referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_name   TEXT NOT NULL,
  friend_phone  TEXT NOT NULL,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | contacted | converted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer ON public.referrals (referrer_id, created_at DESC);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can insert their own referrals
DROP POLICY IF EXISTS "users_insert_own_referrals" ON public.referrals;
CREATE POLICY "users_insert_own_referrals" ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_id = auth.uid());

-- Users can view their own referrals
DROP POLICY IF EXISTS "users_select_own_referrals" ON public.referrals;
CREATE POLICY "users_select_own_referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());

-- Admins: see 20261029000004 (by role, not by e-mail).
