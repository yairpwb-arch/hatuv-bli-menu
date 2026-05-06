-- Tracks every push notification sent.
-- The unique index prevents sending the same notification type
-- to the same user more than once per calendar day (IST).

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT    NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate sends: same user + same type on the same calendar day (Asia/Jerusalem)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_logs_unique_daily
  ON public.notification_logs (user_id, notification_type,
    (DATE(sent_at AT TIME ZONE 'Asia/Jerusalem')));

-- RLS: users can only see their own logs; admins see all
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own logs"
  ON public.notification_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role insert"
  ON public.notification_logs FOR INSERT
  WITH CHECK (true);
