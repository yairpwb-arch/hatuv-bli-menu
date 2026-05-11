-- New self-registrations start as inactive (is_active = false) so they land
-- on /pricing and must be activated by an admin.
-- Admin-added users keep is_active = true (set explicitly via the admin UI).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_active)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    false  -- must be activated by admin
  );

  -- Auto-assign admin role for the designated admin email
  IF LOWER(new.email) = 'yairpwb@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END;
$$;
