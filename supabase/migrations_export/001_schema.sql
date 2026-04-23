-- ============================================================================
-- 001_schema.sql
-- Schema, extensions, enums, and tables for "חטוב בלי תפריט" app
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- optional uuid helpers

-- ---------- Enums ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END$$;

-- ============================================================================
-- Tables
-- ============================================================================

-- profiles: user profile data, id == auth.users.id
CREATE TABLE IF NOT EXISTS public.profiles (
  id              uuid PRIMARY KEY,
  email           text NOT NULL,
  full_name       text,
  phone_number    text,
  avatar_url      text,
  birthdate       date,
  height          numeric,
  initial_weight  numeric,
  current_weight  numeric,
  target_weight   numeric,
  start_date      date,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- user_roles: role assignments (NEVER store roles on profiles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role    public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- habit_definitions: catalog of habits available per program week
CREATE TABLE IF NOT EXISTS public.habit_definitions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  icon       text,
  week_start integer NOT NULL,
  week_end   integer
);

-- daily_habits_log: per-user per-day completion of a habit
CREATE TABLE IF NOT EXISTS public.daily_habits_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  habit_id     uuid NOT NULL REFERENCES public.habit_definitions(id) ON DELETE CASCADE,
  completed_at date NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_daily_habits_log_user_date
  ON public.daily_habits_log(user_id, completed_at);

-- activity_log: per-user per-day completion of an activity
CREATE TABLE IF NOT EXISTS public.activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  activity_type text NOT NULL,
  completed_at  date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_date
  ON public.activity_log(user_id, completed_at);

-- user_activity_schedule: planned weekly activity schedule per user
CREATE TABLE IF NOT EXISTS public.user_activity_schedule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  week_start    integer NOT NULL,
  day_of_week   integer NOT NULL,
  activity_type text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- weight_log: per-user weight history
CREATE TABLE IF NOT EXISTS public.weight_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  weight      numeric NOT NULL,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_weight_log_user_date
  ON public.weight_log(user_id, recorded_at);

-- nutrition_log: meals logged by users with optional AI feedback
CREATE TABLE IF NOT EXISTS public.nutrition_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  meal_description text NOT NULL,
  image_url        text,
  ai_feedback      text,
  recorded_at      timestamptz DEFAULT now()
);

-- transformation_photos: progress photos
CREATE TABLE IF NOT EXISTS public.transformation_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  photo_url  text NOT NULL,
  photo_type text NOT NULL,
  notes      text,
  taken_at   date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- program_content: course/program content unlocked by day
CREATE TABLE IF NOT EXISTS public.program_content (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number   integer NOT NULL,
  week_range    text NOT NULL,
  title         text NOT NULL,
  description   text,
  video_url     text,
  resource_link text,
  unlock_day    integer NOT NULL DEFAULT 1,
  is_bonus      boolean DEFAULT false,
  sort_order    integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- content_progress: which content a user has completed
CREATE TABLE IF NOT EXISTS public.content_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  content_id   uuid NOT NULL REFERENCES public.program_content(id) ON DELETE CASCADE,
  completed_at timestamptz DEFAULT now()
);

-- daily_quotes: daily motivational quote keyed by program day
CREATE TABLE IF NOT EXISTS public.daily_quotes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number integer NOT NULL,
  message    text NOT NULL
);

-- app_settings: simple key/value app settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
