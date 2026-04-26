-- =====================================================
-- User walking schedule
-- walk_number: 1 = from week 1, 2 = from week 4
-- day_of_week: 0=Sun ... 6=Sat, NULL = not yet picked
-- =====================================================

CREATE TABLE public.user_walking_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  walk_number INT NOT NULL CHECK (walk_number IN (1, 2)),
  week_start INT NOT NULL DEFAULT 1,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, walk_number)
);

ALTER TABLE public.user_walking_schedule ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own schedule; admins have full access
CREATE POLICY "walk_rw" ON public.user_walking_schedule
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
