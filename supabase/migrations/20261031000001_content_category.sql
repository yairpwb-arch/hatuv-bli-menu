-- Guide topics for the guides library (תזונה / אירועים ויציאות / אימונים / שינה ושגרה).
-- Optional: until this runs, the app infers the topic from the guide's title.

ALTER TABLE public.program_content
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN ('nutrition', 'events', 'training', 'sleep'));

COMMENT ON COLUMN public.program_content.category IS
  'Guide topic for the guides library; NULL = inferred from the title.';

-- Best-effort backfill for existing guides; admins can correct any row.
UPDATE public.program_content SET category = CASE
  WHEN title ~ '(מסעד|אירוע|חו"ל|חו״ל|טיסה|נופש|חופש|יציא|מסיב|חג)' THEN 'events'
  WHEN title ~ '(אימון|כוח|הליכ|ריצ|כושר)'                         THEN 'training'
  WHEN title ~ '(שינה|שגרה|בוקר|לילה|קימה)'                        THEN 'sleep'
  ELSE 'nutrition'
END
WHERE content_type = 'guide' AND category IS NULL;
