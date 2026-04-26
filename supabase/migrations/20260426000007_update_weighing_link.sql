-- Update weighing guide link
UPDATE public.app_settings
SET value = 'https://drive.google.com/file/d/1Fo74-fgTkHDWQXhC1TTJcVq-myn-ifuR/view?usp=sharing'
WHERE key = 'weighing_guide_link';
