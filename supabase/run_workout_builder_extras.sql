-- The weeks 9–10 offer in the app: a trainee can ask for one extra workout
-- (pull-ups for men, abs for women). The request waits for the workout bot
-- (bot-plans, every 15 minutes), then for a coach, like every plan it builds.

-- The trainee sees their own requests (so the offer isn't shown again).
DROP POLICY IF EXISTS "Trainee reads own bot workout plans" ON public.bot_workout_plans;
CREATE POLICY "Trainee reads own bot workout plans" ON public.bot_workout_plans
  FOR SELECT USING (auth.uid() = user_id);

-- …and can ask only for these two extras, as a new request waiting to be built.
DROP POLICY IF EXISTS "Trainee asks for an extra workout" ON public.bot_workout_plans;
CREATE POLICY "Trainee asks for an extra workout" ON public.bot_workout_plans
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND kind = 'request'
    AND status = 'building'
    AND request IN ('extra_pullups', 'extra_abs')
    AND plan IS NULL
  );

-- Check: 2. Return this.
SELECT count(*) AS trainee_policies
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bot_workout_plans'
  AND policyname IN ('Trainee reads own bot workout plans', 'Trainee asks for an extra workout');
