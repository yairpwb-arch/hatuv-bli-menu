-- Allow admins to delete individual weigh-in entries from the admin panel
-- (e.g. removing a mistaken entry a trainee logged). weight_log only had
-- SELECT access for admins; the existing "manage own" policy is USING-only
-- and scoped to auth.uid() = user_id, so it does not cover admins deleting
-- other users' rows.

CREATE POLICY "Admins can delete weight logs"
  ON public.weight_log FOR DELETE
  USING (public.is_admin());
