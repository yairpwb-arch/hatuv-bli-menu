-- =====================================================
-- New Features Migration
-- Adds: gender, step_logs, exercises, workout tables,
--       surveys, and RLS policies for all new tables
-- =====================================================

-- 1. Add gender to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other'));

-- 2. Step logs
CREATE TABLE public.step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  step_count INT NOT NULL CHECK (step_count >= 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'health_api')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.step_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own step logs"
  ON public.step_logs FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all step logs"
  ON public.step_logs FOR SELECT
  USING (public.is_admin());

-- 3. Exercise library
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  muscle_groups TEXT[] DEFAULT '{}',
  equipment TEXT,
  media_url TEXT,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view exercises"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage exercises"
  ON public.exercises FOR ALL
  USING (public.is_admin());

-- 4. Workout plans (admin-created, global)
CREATE TABLE public.workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  duration_weeks INT NOT NULL DEFAULT 4,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active workout plans"
  ON public.workout_plans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage workout plans"
  ON public.workout_plans FOR ALL
  USING (public.is_admin());

-- 5. Workout plan days
CREATE TABLE public.workout_plan_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  day_number INT NOT NULL CHECK (day_number >= 1),
  name TEXT NOT NULL,
  notes TEXT,
  UNIQUE (plan_id, day_number)
);

ALTER TABLE public.workout_plan_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view workout plan days"
  ON public.workout_plan_days FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage workout plan days"
  ON public.workout_plan_days FOR ALL
  USING (public.is_admin());

-- 6. Workout plan exercises (exercises within a day)
CREATE TABLE public.workout_plan_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id UUID NOT NULL REFERENCES public.workout_plan_days(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets INT NOT NULL DEFAULT 3,
  reps_min INT NOT NULL DEFAULT 8,
  reps_max INT NOT NULL DEFAULT 12,
  rest_seconds INT NOT NULL DEFAULT 60,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

ALTER TABLE public.workout_plan_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view workout plan exercises"
  ON public.workout_plan_exercises FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage workout plan exercises"
  ON public.workout_plan_exercises FOR ALL
  USING (public.is_admin());

-- 7. User workout assignments (admin assigns plan to user)
CREATE TABLE public.user_workout_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_id)
);

ALTER TABLE public.user_workout_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workout assignments"
  ON public.user_workout_assignments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all workout assignments"
  ON public.user_workout_assignments FOR ALL
  USING (public.is_admin());

-- 8. Workout session logs (completed workouts)
CREATE TABLE public.workout_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_day_id UUID REFERENCES public.workout_plan_days(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own workout sessions"
  ON public.workout_session_logs FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all workout sessions"
  ON public.workout_session_logs FOR SELECT
  USING (public.is_admin());

-- 9. Workout exercise logs (sets/reps per exercise in a session)
CREATE TABLE public.workout_exercise_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_session_logs(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  set_number INT NOT NULL CHECK (set_number >= 1),
  reps INT,
  weight_kg NUMERIC(6,2),
  duration_seconds INT,
  notes TEXT
);

ALTER TABLE public.workout_exercise_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own exercise logs"
  ON public.workout_exercise_logs FOR ALL
  USING (
    auth.uid() = (
      SELECT user_id FROM public.workout_session_logs WHERE id = session_id
    )
  );

CREATE POLICY "Admins can view all exercise logs"
  ON public.workout_exercise_logs FOR SELECT
  USING (public.is_admin());

-- 10. Weekly surveys
CREATE TABLE public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INT NOT NULL,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_number)
);

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active surveys"
  ON public.surveys FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage surveys"
  ON public.surveys FOR ALL
  USING (public.is_admin());

-- 11. Survey questions
CREATE TABLE public.survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'scale' CHECK (question_type IN ('scale', 'text', 'yesno')),
  sort_order INT NOT NULL DEFAULT 0
);

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view survey questions"
  ON public.survey_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage survey questions"
  ON public.survey_questions FOR ALL
  USING (public.is_admin());

-- 12. Survey responses
CREATE TABLE public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  response_value INT,
  response_text TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own survey responses"
  ON public.survey_responses FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all survey responses"
  ON public.survey_responses FOR SELECT
  USING (public.is_admin());

-- 13. Storage bucket for exercise media
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise_media', 'exercise_media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Exercise media is publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exercise_media');

CREATE POLICY "Admins can manage exercise media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exercise_media' AND public.is_admin());

CREATE POLICY "Admins can update exercise media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'exercise_media' AND public.is_admin());

CREATE POLICY "Admins can delete exercise media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'exercise_media' AND public.is_admin());
