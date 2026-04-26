-- Add weighing guide link to app_settings
INSERT INTO public.app_settings (key, value)
VALUES ('weighing_guide_link', '')
ON CONFLICT (key) DO NOTHING;
