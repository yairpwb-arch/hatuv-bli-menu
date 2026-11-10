-- The test group → the trainee account yairluzon18w@gmail.com (instead of yairpwb).
-- Only the test group's row changes; nothing else.

UPDATE public.whatsapp_groups g
SET user_id = u.id
FROM auth.users u
WHERE g.chat_id = '120363429658124625@g.us'
  AND lower(u.email) = 'yairluzon18w@gmail.com';

-- Check: one row, this email, its start date and program day. Return this.
SELECT u.email, p.start_date, (CURRENT_DATE - p.start_date) + 1 AS program_day
FROM public.whatsapp_groups g
JOIN auth.users u ON u.id = g.user_id
LEFT JOIN public.profiles p ON p.id = g.user_id
WHERE g.chat_id = '120363429658124625@g.us';
