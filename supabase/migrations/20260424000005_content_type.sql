-- =====================================================
-- Add content_type to program_content
-- Replaces the binary is_bonus with a richer type:
--   'video' | 'content' | 'guide'
-- =====================================================

ALTER TABLE public.program_content
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'video'
  CHECK (content_type IN ('video', 'content', 'guide'));
