-- =====================================================
-- Fix incorrect exercise GIF assignments
-- ExerciseDB OSS free tier has very limited coverage of
-- basic bodyweight exercises. For exercises with no
-- correct match available, media_url is cleared (NULL)
-- which is better than showing a wrong exercise.
-- =====================================================

-- אופניים (bicycle crunch)
-- ExerciseDB OSS has no bodyweight version — cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'אופניים';

-- לאנצ׳י צידי (side lunge)
-- Was: walking lunge (IZVHb27) → Now: barbell lateral lunge (correct lateral movement)
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/py1HSzx.gif'
  WHERE name = 'לאנצ׳י צידי';

-- מתח הפוך (inverted row / Australian pull-up)
-- Was: inverted row bent knees (VPPtusI) → Now: inverted row on bench (better form)
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/Mxa7Cr8.gif'
  WHERE name = 'מתח הפוך';

-- סופרמן (floor superman)
-- Was: superman push-up (completely different movement) → cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'סופרמן';

-- סמוך קום (chair squat / sit-to-stand)
-- Was: squatting row (completely wrong exercise) → cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'סמוך קום';

-- סקוואט (bodyweight squat)
-- Was: squatting row (completely wrong exercise) → cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'סקוואט';

-- סקוואט קפיצה (jump squat)
-- ExerciseDB OSS has no correct match → cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'סקוואט קפיצה';

-- פינגווינים (heel touchers)
-- Was: tuck crunch (wrong movement) → cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'פינגווינים';

-- קפיצות כוכב (jumping jacks)
-- ExerciseDB OSS has no correct match → cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'קפיצות כוכב';

-- שכיבות סמיכה פייק (floor pike push-up)
-- Was: exercise ball pike push-up (different equipment) → cleared
UPDATE public.exercises SET media_url = NULL
  WHERE name = 'שכיבות סמיכה פייק';
