-- Allow admins to read all users' step data in the admin panel.
-- steps_log was created after the main admin policies migration and was missing this bypass.

DROP POLICY IF EXISTS "Admins can view all step logs" ON public.steps_log;

CREATE POLICY "Admins can view all step logs"
  ON public.steps_log FOR SELECT
  USING (public.is_admin());
