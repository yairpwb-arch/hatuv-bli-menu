-- ============================================================================
-- 002_rls_policies.sql
-- Enable RLS and create all policies. Depends on functions in 003 (has_role,
-- is_admin) — but since policies only EVALUATE those functions at query time,
-- you may run this file before or after 003. For a clean install run:
--   001_schema.sql -> 003_functions_and_triggers.sql -> 002_rls_policies.sql
-- Idempotent via DROP POLICY IF EXISTS.
-- ============================================================================

-- ---------- Enable RLS ----------
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_definitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_habits_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transformation_photos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_content        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings           ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- profiles
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"       ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles"     ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles"         ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin() OR auth.uid() = id);

-- ============================================================================
-- user_roles
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles"    ON public.user_roles;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin());

-- ============================================================================
-- habit_definitions (catalog – read for all authenticated, manage for admins)
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view habits" ON public.habit_definitions;
DROP POLICY IF EXISTS "Admins can manage habits"            ON public.habit_definitions;

CREATE POLICY "Authenticated users can view habits"
  ON public.habit_definitions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage habits"
  ON public.habit_definitions FOR ALL
  USING (public.is_admin());

-- ============================================================================
-- daily_habits_log
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own habit logs" ON public.daily_habits_log;
DROP POLICY IF EXISTS "Admins can view all habit logs"        ON public.daily_habits_log;

CREATE POLICY "Users can manage their own habit logs"
  ON public.daily_habits_log FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all habit logs"
  ON public.daily_habits_log FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- activity_log
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Admins can view all activity logs"        ON public.activity_log;

CREATE POLICY "Users can manage their own activity logs"
  ON public.activity_log FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity logs"
  ON public.activity_log FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- user_activity_schedule
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own schedules" ON public.user_activity_schedule;
DROP POLICY IF EXISTS "Admins can view all schedules"        ON public.user_activity_schedule;

CREATE POLICY "Users can manage their own schedules"
  ON public.user_activity_schedule FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all schedules"
  ON public.user_activity_schedule FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- weight_log
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own weight logs" ON public.weight_log;
DROP POLICY IF EXISTS "Admins can view all weight logs"        ON public.weight_log;

CREATE POLICY "Users can manage their own weight logs"
  ON public.weight_log FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all weight logs"
  ON public.weight_log FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- nutrition_log
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own nutrition logs" ON public.nutrition_log;
DROP POLICY IF EXISTS "Admins can view all nutrition logs"        ON public.nutrition_log;

CREATE POLICY "Users can manage their own nutrition logs"
  ON public.nutrition_log FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all nutrition logs"
  ON public.nutrition_log FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- transformation_photos
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own photos"   ON public.transformation_photos;
DROP POLICY IF EXISTS "Users can insert their own photos" ON public.transformation_photos;
DROP POLICY IF EXISTS "Users can delete their own photos" ON public.transformation_photos;
DROP POLICY IF EXISTS "Admins can view all photos"        ON public.transformation_photos;

CREATE POLICY "Users can view their own photos"
  ON public.transformation_photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own photos"
  ON public.transformation_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own photos"
  ON public.transformation_photos FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all photos"
  ON public.transformation_photos FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- program_content
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view content" ON public.program_content;
DROP POLICY IF EXISTS "Admins can manage content"            ON public.program_content;

CREATE POLICY "Authenticated users can view content"
  ON public.program_content FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage content"
  ON public.program_content FOR ALL
  USING (public.is_admin());

-- ============================================================================
-- content_progress
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own progress" ON public.content_progress;
DROP POLICY IF EXISTS "Admins can view all progress"        ON public.content_progress;

CREATE POLICY "Users can manage their own progress"
  ON public.content_progress FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all progress"
  ON public.content_progress FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- daily_quotes
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view quotes" ON public.daily_quotes;
DROP POLICY IF EXISTS "Admins can manage quotes"            ON public.daily_quotes;

CREATE POLICY "Authenticated users can view quotes"
  ON public.daily_quotes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage quotes"
  ON public.daily_quotes FOR ALL
  USING (public.is_admin());

-- ============================================================================
-- app_settings
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can manage settings"            ON public.app_settings;

CREATE POLICY "Authenticated users can view settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage settings"
  ON public.app_settings FOR ALL
  USING (public.is_admin());
