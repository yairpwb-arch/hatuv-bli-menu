-- Add height and initial_weight columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height numeric;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS initial_weight numeric;

-- Create storage bucket for videos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for videos bucket
CREATE POLICY "Videos are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'videos');

CREATE POLICY "Admins can upload videos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'videos' AND is_admin());

CREATE POLICY "Admins can update videos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'videos' AND is_admin());

CREATE POLICY "Admins can delete videos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'videos' AND is_admin());