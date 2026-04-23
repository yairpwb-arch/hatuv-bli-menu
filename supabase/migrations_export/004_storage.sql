-- ============================================================================
-- 004_storage.sql
-- Storage buckets and their RLS policies.
-- Idempotent via ON CONFLICT and DROP POLICY IF EXISTS.
-- ============================================================================

-- ---------- Buckets ---------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('meal_photos', 'meal_photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile_photos', 'profile_photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ---------- Storage object policies -----------------------------------------
-- storage.objects already has RLS enabled by Supabase.

-- ===== videos (public read, admin manage) =====
DROP POLICY IF EXISTS "Videos are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage videos"    ON storage.objects;

CREATE POLICY "Videos are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

CREATE POLICY "Admins can manage videos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'videos' AND public.is_admin())
  WITH CHECK (bucket_id = 'videos' AND public.is_admin());

-- ===== profile_photos (public read, owner write — owner is folder = user id) =====
DROP POLICY IF EXISTS "Profile photos are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile photo" ON storage.objects;

CREATE POLICY "Profile photos are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile_photos');

CREATE POLICY "Users can upload their own profile photo"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own profile photo"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own profile photo"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ===== meal_photos (private — owner only, admins can read) =====
DROP POLICY IF EXISTS "Users can view their own meal photos"   ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all meal photos"        ON storage.objects;

CREATE POLICY "Users can view their own meal photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meal_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload their own meal photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meal_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own meal photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meal_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins can view all meal photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'meal_photos' AND public.is_admin());
