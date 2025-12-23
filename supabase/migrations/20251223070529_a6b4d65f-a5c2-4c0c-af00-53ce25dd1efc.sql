-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  start_date DATE,
  current_weight DECIMAL(5,2),
  phone_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create program_content table
CREATE TABLE public.program_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number INT NOT NULL CHECK (part_number IN (1, 2, 3)),
  week_range TEXT NOT NULL,
  unlock_day INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  resource_link TEXT,
  is_bonus BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create daily_quotes table (168 days)
CREATE TABLE public.daily_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number INT UNIQUE NOT NULL CHECK (day_number >= 1 AND day_number <= 168),
  message TEXT NOT NULL
);

-- Create habit_definitions table
CREATE TABLE public.habit_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  week_start INT NOT NULL,
  week_end INT,
  icon TEXT
);

-- Create daily_habits_log table
CREATE TABLE public.daily_habits_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  habit_id UUID REFERENCES public.habit_definitions(id) ON DELETE CASCADE NOT NULL,
  completed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (user_id, habit_id, completed_at)
);

-- Create weight_log table
CREATE TABLE public.weight_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  weight DECIMAL(5,2) NOT NULL,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create nutrition_log table
CREATE TABLE public.nutrition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meal_description TEXT NOT NULL,
  ai_feedback TEXT,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Create content_progress table
CREATE TABLE public.content_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content_id UUID REFERENCES public.program_content(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, content_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_habits_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_progress ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is admin (by email)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND LOWER(email) = 'yairpwb@gmail.com'
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin() OR auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin());

-- RLS Policies for program_content (readable by all authenticated users)
CREATE POLICY "Authenticated users can view content"
  ON public.program_content FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage content"
  ON public.program_content FOR ALL
  USING (public.is_admin());

-- RLS Policies for daily_quotes (readable by all authenticated users)
CREATE POLICY "Authenticated users can view quotes"
  ON public.daily_quotes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage quotes"
  ON public.daily_quotes FOR ALL
  USING (public.is_admin());

-- RLS Policies for habit_definitions (readable by all authenticated users)
CREATE POLICY "Authenticated users can view habits"
  ON public.habit_definitions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage habits"
  ON public.habit_definitions FOR ALL
  USING (public.is_admin());

-- RLS Policies for daily_habits_log
CREATE POLICY "Users can manage their own habit logs"
  ON public.daily_habits_log FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all habit logs"
  ON public.daily_habits_log FOR SELECT
  USING (public.is_admin());

-- RLS Policies for weight_log
CREATE POLICY "Users can manage their own weight logs"
  ON public.weight_log FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all weight logs"
  ON public.weight_log FOR SELECT
  USING (public.is_admin());

-- RLS Policies for nutrition_log
CREATE POLICY "Users can manage their own nutrition logs"
  ON public.nutrition_log FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all nutrition logs"
  ON public.nutrition_log FOR SELECT
  USING (public.is_admin());

-- RLS Policies for content_progress
CREATE POLICY "Users can manage their own progress"
  ON public.content_progress FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all progress"
  ON public.content_progress FOR SELECT
  USING (public.is_admin());

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial habit definitions
INSERT INTO public.habit_definitions (name, week_start, week_end, icon) VALUES
  ('שתיית מים', 1, 2, 'droplets'),
  ('הליכה יומית', 1, 2, 'footprints'),
  ('אכילה איטית', 2, 3, 'timer'),
  ('לוח שינה', 3, 5, 'moon'),
  ('3 הרגלים', 4, 10, 'target'),
  ('תזונה מאוזנת', 6, 24, 'apple');

-- Seed initial program content
INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, is_bonus, sort_order) VALUES
  (1, 'מבוא', 1, 'ברוכים הבאים למסע', 'היכרות עם התוכנית ועקרונות הבסיס', false, 1),
  (1, 'מבוא', 1, 'מדריך חטיפים', 'כל מה שצריך לדעת על חטיפים בריאים', false, 2),
  (1, 'שבוע 1', 1, '2 ההרגלים הראשונים', 'מים והליכה - הבסיס לשינוי', false, 3),
  (1, 'שבוע 1', 1, 'בונוס: אכילה איטית', 'טכניקות לאכילה מודעת', true, 4),
  (1, 'שבוע 2', 8, 'הרגל שני - שיפור', 'העמקה בשני ההרגלים', false, 5),
  (1, 'שבוע 3', 15, 'לוח שינה', 'חשיבות השינה לירידה במשקל', false, 6),
  (1, 'שבוע 4-5', 22, '3 הרגלים', 'שילוב כל ההרגלים יחד', false, 7),
  (2, 'בסיס הרגלים', 36, 'יסודות ההרגל', 'איך הרגלים נוצרים ומשתנים', false, 8),
  (2, 'בסיס הרגלים', 36, 'מסעדות ואירועים', 'איך לשמור על התזונה באירועים', false, 9),
  (2, 'שבוע 6-7', 42, 'תזמון ארוחות', 'מתי לאכול לתוצאות מיטביות', false, 10),
  (2, 'שבוע 6-7', 42, 'הסתגלות מטבולית', 'הבנת הגוף והתגובות שלו', false, 11),
  (2, 'שבוע 8-10', 56, 'שילוב קבוצות מזון', 'בניית ארוחה מושלמת', false, 12),
  (2, 'שבוע 11-15', 77, 'רטבים ותיבולים', 'טעמים בריאים', false, 13),
  (2, 'שבוע 11-15', 77, 'מדריך אימונים ראשון', 'התחלת פעילות גופנית', false, 14),
  (3, 'אינטגרציה', 106, 'שילוב הרגלים מתקדם', 'הכל מתחבר יחד', false, 15),
  (3, 'שבוע 16-18', 112, 'הרגלים מתקדמים', 'רמה הבאה', false, 16),
  (3, 'שבוע 16-18', 112, 'עצימות אימונים', 'העלאת הרף', false, 17),
  (3, 'שבוע 19-24', 133, 'מעקב אישי', 'למידה עצמית ושיפור', false, 18);

-- Seed sample daily quotes (first 14 days)
INSERT INTO public.daily_quotes (day_number, message) VALUES
  (1, 'כל מסע של אלף מילין מתחיל בצעד אחד. היום התחלת את הצעד הראשון שלך!'),
  (2, 'השינוי לא קורה בין לילה, אבל כל יום קטן בונה את המציאות החדשה שלך.'),
  (3, 'המים הם חיים. תן לגוף שלך את מה שהוא צריך.'),
  (4, 'הליכה היא לא רק תנועה - היא זמן לחשוב, לנשום ולהתחבר לעצמך.'),
  (5, 'אתה יותר חזק ממה שאתה חושב. המשך קדימה!'),
  (6, 'כל ארוחה היא הזדמנות לבחור בריא. בחר נכון.'),
  (7, 'שבוע ראשון מאחוריך! אתה כבר לא אותו אדם שהתחיל.'),
  (8, 'הרגלים טובים יוצרים תוצאות טובות. המשך לבנות.'),
  (9, 'הגוף שלך הוא הבית שלך. טפל בו כמו שמטפלים באוצר.'),
  (10, 'כל יום שאתה מתמיד, אתה מוכיח לעצמך שאתה יכול.'),
  (11, 'אל תשווה את עצמך לאחרים. השווה את עצמך לאתמול שלך.'),
  (12, 'ההצלחה היא לא מטרה - היא דרך חיים.'),
  (13, 'הקשבה לגוף היא מיומנות. למד אותה.'),
  (14, 'שבועיים! כבר יצרת בסיס יציב. עכשיו הזמן להעמיק.');
