-- ============================================================
-- Gym Tracker Schema
-- Run this in Supabase SQL editor after creating the project
-- ============================================================

-- Programs: stores the intake result (routine + profile + targets)
create table if not exists programs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  created_at   timestamptz default now(),
  profile      jsonb not null default '{}',
  routine      jsonb not null default '{}',
  targets      jsonb not null default '{}',
  intake_chat  text
);

alter table programs enable row level security;

create policy "users see own programs"
  on programs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Day 0 results: baseline test per program
create table if not exists day0_results (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  program_id    uuid references programs,
  completed_at  timestamptz default now(),
  results       jsonb not null default '{}'
  -- results shape: { [liftId]: { weight, reps, est1rm, workingWeight } }
);

alter table day0_results enable row level security;

create policy "users see own day0"
  on day0_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Workout logs: one row per (user, program, week, day)
create table if not exists workout_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  program_id  uuid references programs,
  week_num    int not null,
  day_num     int not null,
  logged_at   timestamptz default now(),
  exercises   jsonb not null default '{}'
  -- exercises shape: { [exId]: { sets: [{weight, reps, rpe}] } }
);

alter table workout_logs enable row level security;

create policy "users see own logs"
  on workout_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Unique constraint: one log per (user, program, week, day)
create unique index if not exists workout_logs_unique
  on workout_logs (user_id, program_id, week_num, day_num);
