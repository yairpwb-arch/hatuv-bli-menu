-- =====================================================
-- Improved exercise GIF assignments
-- Sources:
--   ExerciseDB OSS: https://static.exercisedb.dev/media/{id}.gif
--   GIPHY (stable embed): https://media.giphy.com/media/{id}/giphy.gif
-- All IDs verified against hasaneyldrm/exercises-dataset
-- =====================================================

-- ─────────────────────────────────────────────────
-- Fix previously NULL exercises (no GIF at all)
-- ─────────────────────────────────────────────────

-- אופניים (bicycle crunch / air bike)
-- air bike [body weight] — correct bicycle crunch motion
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/1ZFqTDN.gif'
  WHERE name = 'אופניים';

-- סופרמן (floor superman — lying prone, lift arms & legs)
-- "Tabata Workout For Beginners Supermans Exercise" by ePainAssist (GIPHY)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/xT0BKJCBQAjY4LiuOc/giphy.gif'
  WHERE name = 'סופרמן';

-- סמוך קום (chair squat / sit-to-stand with support)
-- potty squat with support [body weight] — assisted bodyweight squat
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/b63ZzGe.gif'
  WHERE name = 'סמוך קום';

-- סקוואט (standard bodyweight squat)
-- Air squat by CrossFit — clean, standard bodyweight squat (GIPHY)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/aT4gLVz0A9ROxqLgI1/giphy.gif'
  WHERE name = 'סקוואט';

-- סקוואט קפיצה (jump squat)
-- jump squat [body weight] — correct plyometric squat
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/LIlE5Tn.gif'
  WHERE name = 'סקוואט קפיצה';

-- פינגווינים (heel touchers)
-- alternate heel touchers [body weight] — correct exercise!
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/qaZVsGk.gif'
  WHERE name = 'פינגווינים';

-- קפיצות כוכב (jumping jacks)
-- jack jump (male) [body weight] — jumping jacks
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/1g5bPpA.gif'
  WHERE name = 'קפיצות כוכב';

-- שכיבות סמיכה פייק (pike push-up on floor)
-- pike-to-cobra push-up [body weight] — floor pike push-up
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/XPUDTt7.gif'
  WHERE name = 'שכיבות סמיכה פייק';

-- ─────────────────────────────────────────────────
-- Improve existing GIFs with more accurate matches
-- ─────────────────────────────────────────────────

-- סקוואט רחב (wide/sumo squat)
-- Was: smith sumo squat (machine) → Now: bodyweight sumo squat (GIPHY)
UPDATE public.exercises SET media_url = 'https://media.giphy.com/media/olE9U3Qhl7s2ybhZWG/giphy.gif'
  WHERE name = 'סקוואט רחב';

-- מקבילים (parallel bar dips)
-- Was: chest dip generic → Now: chest dip on dip-pull-up cage (shows bars clearly)
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/XgWyAiA.gif'
  WHERE name = 'מקבילים';

-- מתח רחב (wide grip pull-ups)
-- Was: rear pull-up (CbFSYC1) → Now: wide grip pull-up (standard wide grip)
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/Qqi7bko.gif'
  WHERE name = 'מתח רחב';

-- מתח צר (narrow pull-ups)
-- Was: close grip chin-up (VnfUNW7) → Now: biceps narrow pull-ups (more accurate)
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/50BETrz.gif'
  WHERE name = 'מתח צר';

-- לאנצ׳ים (forward lunges)
-- Was: walking lunge (IZVHb27) → Now: forward lunge male (clearer single-rep demo)
UPDATE public.exercises SET media_url = 'https://static.exercisedb.dev/media/kMzUs9Y.gif'
  WHERE name = 'לאנצ׳ים';
