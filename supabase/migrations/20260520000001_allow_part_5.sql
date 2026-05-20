-- Allow part_number 4 and 5 in program_content
ALTER TABLE public.program_content
  DROP CONSTRAINT IF EXISTS program_content_part_number_check;

ALTER TABLE public.program_content
  ADD CONSTRAINT program_content_part_number_check
  CHECK (part_number IN (1, 2, 3, 4, 5));
