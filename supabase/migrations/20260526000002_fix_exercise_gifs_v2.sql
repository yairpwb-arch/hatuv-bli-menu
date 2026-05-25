-- =====================================================
-- Fix 5 incorrect exercise GIF assignments (user reported)
-- Sources: GIPHY stable embed + ExerciseDB OSS
-- =====================================================

-- מתח צר (narrow/close-grip pull-ups — overhand)
-- Was: biceps narrow pull-ups (underhand grip, wrong)
-- Now: close-grip pull-up (overhand, confirmed calisthenics demo)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/ePDpalzgtkg47vorBU/giphy.gif'
  WHERE name = 'מתח צר';

-- מתח רחב (wide-grip pull-ups — overhand)
-- Was: wide grip pull-up ExerciseDB (visual quality issue)
-- Now: wide-grip pull-up how-to demo (100 Days of Discipline)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/8NLlhCIQQOBzCGbWjy/giphy.gif'
  WHERE name = 'מתח רחב';

-- מתח הפוך (Australian pull-up / inverted row — horizontal)
-- Was: inverted row on bench (shows bench behind, less clear)
-- Now: Australian pull-ups confirmed (under horizontal bar)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/ZYYfYvXwU329tzW5FM/giphy.gif'
  WHERE name = 'מתח הפוך';

-- סמוך קום (chair squat / sit-to-stand)
-- Was: potty squat with support (too deep, wrong shape)
-- Now: sit-to-stand squat by Twin Cities Orthopedics (medical rehab demo)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/YOwchcZiCSA7NwUuP8/giphy.gif'
  WHERE name = 'סמוך קום';

-- סקוואט קפיצה (jump squat — plyometric)
-- Was: jump squat ExerciseDB (visual quality issue)
-- Now: Jumping Squat by Crossfit Boran (confirmed clean demo)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/WtnkfTBF2D2OsODSxf/giphy.gif'
  WHERE name = 'סקוואט קפיצה';
