-- Add image_url column to nutrition_log table
ALTER TABLE public.nutrition_log ADD COLUMN IF NOT EXISTS image_url text;

-- Create meal_photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('meal_photos', 'meal_photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for meal_photos bucket
CREATE POLICY "Anyone can view meal photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'meal_photos');

CREATE POLICY "Authenticated users can upload meal photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meal_photos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own meal photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'meal_photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own meal photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'meal_photos' AND auth.uid()::text = (storage.foldername(name))[1]);