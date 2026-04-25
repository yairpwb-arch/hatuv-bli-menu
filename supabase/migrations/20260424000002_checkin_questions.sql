-- =====================================================
-- Checkin Questions Table
-- Stores the weekly check-in questions, editable by admin
-- column_key maps to the corresponding column in weekly_checkin
-- =====================================================

CREATE TABLE IF NOT EXISTS public.checkin_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order INT NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'number', 'scale', 'yesno', 'textarea')),
  column_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.checkin_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view checkin questions" ON public.checkin_questions;
CREATE POLICY "Authenticated users can view checkin questions"
  ON public.checkin_questions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage checkin questions" ON public.checkin_questions;
CREATE POLICY "Admins can manage checkin questions"
  ON public.checkin_questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Seed the 13 default questions (skip if already seeded)
INSERT INTO public.checkin_questions (sort_order, question_text, question_type, column_key, is_active) VALUES
  (1,  'שם מלא שלך',                                                         'text',     'full_name',         true),
  (2,  'כמה שקלתי שקילה שעברה? (ק"ג)',                                       'number',   'last_weigh_in',     true),
  (3,  'משקל היום? (ק"ג)',                                                    'number',   'weight_today',      true),
  (4,  'עמדתי בהרגלים השבוע (1 - 10)',                                        'scale',    'habits_score',      true),
  (5,  'עמדתי בהליכות שהתחייבתי אליהם השבוע (1 - 10)',                       'scale',    'walking_score',     true),
  (6,  'כמה אתה רעב ביום יום (1 - 10)',                                       'scale',    'hunger_score',      true),
  (7,  'רמת כוח ומוטיבציה כללית (1 - 10)',                                    'scale',    'energy_score',      true),
  (8,  'הקפדה על מים השבוע (1 - 10)',                                         'scale',    'water_score',       true),
  (9,  'שעות שינה ממוצעות בלילה',                                             'number',   'sleep_hours',       true),
  (10, 'האם היו תקיעות ביציאות שלך (בשירותים) במהלך השבוע?',                 'yesno',    'had_bowel_issues',  true),
  (11, 'דבר אחד שאני גאה בו השבוע',                                          'textarea', 'proud_of',          true),
  (12, 'דבר אחד שאני צריך לשפר לשבוע הבא',                                  'textarea', 'to_improve',        true),
  (13, 'האם עמדתי ביעד שלי משבוע שעבר?',                                     'yesno',    'met_last_goal',     true);
