-- Zygier as admin. The user is created first in Authentication → Users → Add user
-- (with "Auto Confirm User"); this gives that account the admin role.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE lower(u.email) = 'yairzygier@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

SELECT u.email, EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin
FROM auth.users u
WHERE lower(u.email) = 'yairzygier@gmail.com';
