-- =====================================================
-- Snacks book link in app_settings
-- Videos storage bucket
-- =====================================================

-- Add snacks book link
INSERT INTO public.app_settings (key, value)
VALUES ('snacks_book_link', 'https://hathovimclab.lovable.app')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Create videos storage bucket (public read access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  524288000,  -- 500 MB limit
  ARRAY['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/ogg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 524288000;

-- RLS: anyone can read videos
DROP POLICY IF EXISTS "Public videos read" ON storage.objects;
CREATE POLICY "Public videos read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

-- RLS: authenticated users can upload videos (admin manages in practice)
DROP POLICY IF EXISTS "Authenticated upload videos" ON storage.objects;
CREATE POLICY "Authenticated upload videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'videos');

DROP POLICY IF EXISTS "Owner delete videos" ON storage.objects;
CREATE POLICY "Owner delete videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'videos' AND auth.uid() = owner);
