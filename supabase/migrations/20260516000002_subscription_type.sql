-- subscription_type: 'program' for admin-created fixed-duration users, 'subscription' for monthly IAP users
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_type TEXT NOT NULL DEFAULT 'subscription';
