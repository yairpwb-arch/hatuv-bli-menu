-- Fix habit week_end values to match the program flowchart.
-- Habits should end the week BEFORE their replacement habit starts,
-- so they don't both appear simultaneously.

-- "ירקות בכל ארוחה" (week 2) ends at week 7.
-- "שליש חלבון/פחמימה/ירק" starts at week 8 — covers the vegetable habit.
UPDATE public.habit_definitions
SET week_end = 7
WHERE name = 'ירקות בכל ארוחה' AND user_id IS NULL;

-- "רוטב אחד בארוחה" (week 4) ends at week 10.
-- "בחירת רוטב פעם אחת ביום" starts at week 11 — replaces this habit.
UPDATE public.habit_definitions
SET week_end = 10
WHERE name = 'רוטב אחד בארוחה' AND user_id IS NULL;
