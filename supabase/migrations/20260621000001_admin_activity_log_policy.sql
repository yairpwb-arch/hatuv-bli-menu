-- Allow admin to read all users' activity_log entries (walks/workouts)
-- so that walk completions logged by users appear in the admin dashboard history.
CREATE POLICY "admins_select_all_activity_log" ON public.activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND email = 'yairpwb@gmail.com'
    )
  );
