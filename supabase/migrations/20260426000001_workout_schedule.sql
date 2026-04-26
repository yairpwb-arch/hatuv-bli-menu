-- =====================================================
-- workout_day_schedule — user picks a weekday per plan day
-- weekday: 0=Sun, 1=Mon, ..., 6=Sat  (matches JS getDay())
-- =====================================================

CREATE TABLE IF NOT EXISTS public.workout_day_schedule (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_day_id UUID        NOT NULL REFERENCES public.workout_plan_days(id) ON DELETE CASCADE,
  weekday     SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_day_id)
);

ALTER TABLE public.workout_day_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workout schedule"
  ON public.workout_day_schedule
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
