-- Create a table for global app settings (admin-managed links)
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage settings
CREATE POLICY "Admins can manage settings" 
ON public.app_settings 
FOR ALL 
USING (is_admin());

-- Anyone authenticated can view settings
CREATE POLICY "Authenticated users can view settings" 
ON public.app_settings 
FOR SELECT 
USING (true);

-- Insert default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('weekly_survey_link', ''),
  ('snacks_book_link', '');

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();