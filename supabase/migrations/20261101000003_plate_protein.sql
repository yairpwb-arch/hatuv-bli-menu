-- The home plate's protein third can be its own habit ("חלבון בכל ארוחה").
ALTER TABLE public.habit_definitions DROP CONSTRAINT IF EXISTS habit_definitions_visual_key_check;
ALTER TABLE public.habit_definitions ADD CONSTRAINT habit_definitions_visual_key_check CHECK (visual_key IN (
  'water_before_meal', 'plate_thirds', 'plate_veggies', 'plate_protein', 'one_plate', 'one_sauce',
  'slow_eating', 'olive_oil', 'fruit_snack', 'water_before_snack', 'meals_4',
  'routine_wake_eat', 'routine_stop_eating', 'routine_sleep',
  'no_sweet_drinks', 'coffee_sugar'
));

UPDATE public.habit_definitions SET visual_key = 'plate_protein' WHERE name = 'חלבון בכל ארוחה' AND user_id IS NULL;
