-- Content page redesign: a name (and optional subtitle) per program part, and
-- a length per content item. Both are optional — the app falls back to
-- "חלק N", a subtitle worked out from the unlock days, and no duration.

-- ── Per-item duration ────────────────────────────────────────────────────────
ALTER TABLE public.program_content
  ADD COLUMN IF NOT EXISTS duration_minutes INT CHECK (duration_minutes > 0);

COMMENT ON COLUMN public.program_content.duration_minutes IS
  'Approximate length in minutes ("4 דק''" on the content map). NULL = not shown.';

-- ── Program parts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.program_parts (
  part_number INT  PRIMARY KEY,
  -- "בניית הבסיס" → shown as "חלק 2 · בניית הבסיס"
  name        TEXT,
  -- e.g. "שבועות 5–12 · תוכן חדש כל שבועיים"; NULL = worked out from the unlock days
  subtitle    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read parts" ON public.program_parts;
CREATE POLICY "Authenticated users read parts"
  ON public.program_parts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage parts" ON public.program_parts;
CREATE POLICY "Admins manage parts"
  ON public.program_parts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- One row per part that has content; names to be filled in by the admin.
INSERT INTO public.program_parts (part_number, name)
SELECT DISTINCT part_number, CASE WHEN part_number = 5 THEN 'הבסיס לשינוי הרגלים' END
FROM public.program_content
ON CONFLICT (part_number) DO NOTHING;
