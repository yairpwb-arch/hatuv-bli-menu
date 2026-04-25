-- Make meal_photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'meal_photos';

-- Ensure RLS policies restrict access properly
-- Drop existing policies if they exist and recreate
-- Drop old broad policies from previous migration
DROP POLICY IF EXISTS "Anyone can view meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own meal photos" ON storage.objects;
-- Drop new-named policies in case of re-run
DROP POLICY IF EXISTS "Users can upload their own meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all meal photos" ON storage.objects;

-- Create proper RLS policies for meal_photos bucket
CREATE POLICY "Users can upload their own meal photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'meal_photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own meal photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'meal_photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own meal photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'meal_photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow admins to view all meal photos
CREATE POLICY "Admins can view all meal photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'meal_photos' 
  AND public.is_admin()
);