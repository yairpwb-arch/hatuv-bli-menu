-- =====================================================
-- Fix סמוך קום — it's a burpee (squat + push-up position)
-- User clarification: jump → squat → plank → back up
-- =====================================================

UPDATE public.exercises
SET
  media_url   = 'https://static.exercisedb.dev/media/dK9394r.gif',
  description = 'עמוד זקוף. קפוץ או ירד במהירות לתנוחת סקוואט תוך נגיעת הידיים ברצפה. זרוק את הרגליים אחורה לתנוחת שכיבת סמיכה (פלאנק). קפוץ חזרה עם הרגליים לתנוחת סקוואט, ועמוד מהר לגובה מלא. מחזק כוח נפיץ, מערכת לב-ריאה וכל הגוף.',
  equipment   = 'bodyweight',
  muscle_groups = ARRAY['ירכיים', 'גלוטאוס', 'חזה', 'כתפיים', 'ליבה']
WHERE name = 'סמוך קום';
