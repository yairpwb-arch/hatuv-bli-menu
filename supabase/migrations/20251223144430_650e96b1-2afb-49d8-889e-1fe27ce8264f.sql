-- Create table for user activity schedules
CREATE TABLE public.user_activity_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL, -- 'walk' or 'workout'
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
  week_start INTEGER NOT NULL, -- The week when this schedule was set
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_type, day_of_week)
);

-- Create table to log completed activities
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  completed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_type, completed_at)
);

-- Enable RLS
ALTER TABLE public.user_activity_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_activity_schedule
CREATE POLICY "Users can manage their own schedules"
ON public.user_activity_schedule
FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all schedules"
ON public.user_activity_schedule
FOR SELECT
USING (is_admin());

-- RLS policies for activity_log
CREATE POLICY "Users can manage their own activity logs"
ON public.activity_log
FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity logs"
ON public.activity_log
FOR SELECT
USING (is_admin());