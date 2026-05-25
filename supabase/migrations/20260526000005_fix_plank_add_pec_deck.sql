-- =====================================================
-- 1. Fix פלאנק — remove 'גב תחתון' so it doesn't appear
--    in the back filter; keep ליבה + כתפיים
-- 2. Add פרפר מכשיר (lever pec deck fly / butterfly machine)
-- =====================================================

-- Fix פלאנק muscle_groups
UPDATE public.exercises
SET muscle_groups = ARRAY['ליבה', 'כתפיים', 'בטן']
WHERE name = 'פלאנק';

-- Add פרפר מכשיר (Pec Deck / Butterfly Machine)
INSERT INTO public.exercises (name, description, muscle_groups, equipment, difficulty, media_url)
VALUES (
  'פרפר מכשיר',
  'שב על המושב עם הגב נשען על המשענת. אחוז בידיות של המכשיר כשהמרפקים כפופים ב-90 מעלות ומושמים על המרפדים. סגור את הידיים זו לזו לפניך בתנועה קשתית תוך כיווץ שרירי החזה בשיא. הורד לאט חזרה ורגש את המתיחה בחזה. מחזק את שרירי החזה הגדולים (פקטורליס) בתנועת בידוד.',
  ARRAY['חזה', 'כתפיים'],
  'machine',
  'beginner',
  'https://static.exercisedb.dev/media/v3xmPAR.gif'
);
