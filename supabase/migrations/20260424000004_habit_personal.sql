-- =====================================================
-- Personal Habits Support
-- Adds optional user_id to habit_definitions so admins
-- can assign custom habits to individual trainees.
-- NULL user_id = global habit (visible to all).
-- =====================================================

ALTER TABLE public.habit_definitions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS habit_definitions_user_id_idx ON public.habit_definitions(user_id);

-- Update RLS: users can now see global habits OR their own personal habits
-- (Assumes RLS is already enabled on habit_definitions)
DROP POLICY IF EXISTS "habit_definitions_select" ON public.habit_definitions;
CREATE POLICY "habit_definitions_select"
  ON public.habit_definitions FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

-- Admins (via service role / Edge Functions) can manage all rows
-- Regular insert/update/delete remain admin-only via existing policies or service role
