-- =============================================================================
-- Bunny Stream videos → program content (replaces the YouTube / Drive links).
-- Paste into the Supabase SQL Editor and run. Safe to run more than once.
-- A content item plays in the app when video_url = 'bunny:<video guid>'.
-- =============================================================================

BEGIN;

WITH links(title_prefix, guid) AS (VALUES
  ('ברוכים הבאים',                    '7e9cd754-41d3-4ab2-82fb-d98ab6fce5aa'),
  ('סרטון העשרה: צימוד הרגלים',       '3769e5ee-5d7c-4c55-8e73-72ea60de6947'),
  ('שבוע 1:',                         'b451f783-5660-4a07-81b8-e180258e6737'),
  ('שבוע 2:',                         '0b955a4f-d836-4bd3-9a12-e7930330da90'),
  ('סרטון העשרה: העלאת זמינות',       '11a19da6-b34f-4e2b-86e1-492da6b0f467'),
  ('שבוע 3:',                         'f8703cba-e213-46e2-81e9-aa15fed0ceea'),
  ('שבוע 4:',                         'acf16049-e399-4e84-819b-c90ebe8d3e6f'),
  ('חלק 2:',                          'b970ea23-95c8-4dd0-9ddc-e9b8aef687be'),
  ('שבועות 5–6:',                     'f087d082-bdc6-4b03-b9e4-e08975cf5838'),
  ('שבועות 7–8:',                     '096a56d7-e685-4149-bba1-0c1ec52054d0'),
  ('שבועות 9–10:',                    '2462c8a4-6463-4dea-a1b7-93ec0cd11f99'),
  ('סרטון העשרה: אדפטציה מטבולית',    '235a993f-5fe6-424a-81ff-3249c5f09003'),
  ('שבועות 11–12:',                   'ef145f22-0941-44ec-829e-4e1a22095130'),
  ('חלק 3:',                          'c2efc102-57ae-48e9-ac98-94f2b94c4a2a'),
  ('שבועות 13–15:',                   'b62a58f5-be91-43b9-bfb2-a98a2c631623'),
  ('שבועות 16–18:',                   '4a4f911c-34d3-4b05-a4ce-aa29750794d7'),
  ('שבועות 19–21:',                   'bb62d019-149f-4145-a3f7-7b016f3ba7ab'),
  ('שבועות 22–24:',                   '1e938d5d-9ba6-41eb-8b0c-839e2ceed972'),
  ('חלק 4:',                          '3e78d609-685b-4ce8-9cab-2b83f5c1b517'),
  ('שבועות 25–28:',                   '7a8f2715-62a2-4207-a660-8db64fa5e3c3'),
  ('שבועות 29–32:',                   '53a5ae79-8436-4e74-afeb-3ed91f8fc0d2'),
  ('שבועות 33–36:',                   'bced6966-c46a-4188-aa93-e8337592d446') 
)
UPDATE public.program_content c
SET video_url = 'bunny:' || l.guid
FROM links l
WHERE c.archived_at IS NULL
  AND c.content_type = 'video'
  AND c.title LIKE l.title_prefix || '%';

COMMIT;

-- Check: every video item and its link. Return this table.
SELECT week_range, title, video_url, (video_url LIKE 'bunny:%') AS ok
FROM public.program_content
WHERE archived_at IS NULL AND content_type = 'video'
ORDER BY sort_order;
