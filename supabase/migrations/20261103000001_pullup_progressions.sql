-- =============================================================================
-- Four pull-up progressions (toward a first pull-up). The description is the
-- coach's text, word for word. Sets / reps / seconds are set per plan as usual;
-- the two holds are timed exercises (is_duration) in the plan.
-- Safe to run more than once: an exercise whose name already exists is skipped.
-- =============================================================================
INSERT INTO public.exercises (name, description, muscle_groups, equipment, difficulty)
SELECT v.name, v.description, v.muscle_groups, v.equipment, v.difficulty
FROM (VALUES
  (
    'מתח שלילי - ירידה איטית',
    '5 מתח שלילי עם ירידה איטית של 4 שניות כפול 3 סטים (עולה למעל המתח עם הגבהה ומבצע רק את הירידה)',
    ARRAY['גב עליון', 'ביצפס', 'כתפיים אחוריות'],
    'pull-up bar',
    'beginner'
  ),
  (
    'החזקה בחצי מתח והחזקה למטה',
    '10 שניות החזקה בחצי מתח (90 מעלות בידיים) ואז ישר עובר ל10 שניות החזקה למטה',
    ARRAY['גב עליון', 'ביצפס', 'כתפיים אחוריות'],
    'pull-up bar',
    'beginner'
  ),
  (
    'מתח עם קפיצה וירידה איטית',
    '3 מתח עם קפיצה וירידה איטית של 4 שניות כפול 2 סטים',
    ARRAY['גב עליון', 'ביצפס', 'כתפיים אחוריות'],
    'pull-up bar',
    'beginner'
  ),
  (
    'החזקה מעל המתח והחזקה למטה',
    '10 שניות החזקה עם ראש מעל המתח ואז ישר 10 שניות החזקה למטה',
    ARRAY['גב עליון', 'ביצפס', 'כתפיים אחוריות'],
    'pull-up bar',
    'beginner'
  )
) AS v(name, description, muscle_groups, equipment, difficulty)
WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.name = v.name);

-- Check: the four exercises. Return this.
SELECT name, equipment, difficulty FROM public.exercises
WHERE name IN ('מתח שלילי - ירידה איטית', 'החזקה בחצי מתח והחזקה למטה', 'מתח עם קפיצה וירידה איטית', 'החזקה מעל המתח והחזקה למטה')
ORDER BY name;
