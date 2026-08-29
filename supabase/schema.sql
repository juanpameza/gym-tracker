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

-- One program per user. Required for upsert(on_conflict=user_id) and keeps the
-- app's single()/maybeSingle() reads unambiguous.
create unique index if not exists programs_user_id_key on programs (user_id);

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

-- When the routine was last (re)imported or forked. The log page compares it
-- with each day's most recent earlier session: if the plan is newer, Claude's
-- imported weight is prescribed verbatim; otherwise the app auto-progresses
-- from what was actually lifted. Backfilled from created_at so programs that
-- predate the column keep auto-progressing exactly as before.
alter table programs add column if not exists routine_updated_at timestamptz;
update programs set routine_updated_at = created_at where routine_updated_at is null;

-- ============================================================
-- SOCIAL LAYER
-- Private-by-default, opt-in. The three tables above and their
-- policies are NEVER touched. No policy below references them.
-- Everything social reads from the tables below only; a user's
-- lifts/routine reach others ONLY via opt-in snapshots they copy
-- into their own `profiles` row (lift_stats, shared_routine) and
-- into activity payloads. Private data is never cross-user read.
-- ============================================================

create extension if not exists citext;

-- Forking provenance on the forker's OWN program row (covered by the
-- existing "users see own programs" policy — additive columns only).
alter table programs add column if not exists forked_from_user uuid references auth.users;
alter table programs add column if not exists forked_from_username text;
alter table programs add column if not exists forked_at timestamptz;

-- ---------------------------------------------------------------
-- profiles: the opt-in public identity (separate from auth.users)
-- ---------------------------------------------------------------
create table if not exists profiles (
  user_id        uuid primary key references auth.users on delete cascade,
  username       citext unique not null,
  display_name   text,
  avatar_url     text,
  bio            text,
  is_public      boolean not null default false,   -- master opt-in switch
  share_stats    boolean not null default false,   -- expose lift_stats
  shares_routine boolean not null default false,   -- expose shared_routine (forkable)
  lift_stats     jsonb not null default '{}',      -- snapshot { [exId]: { name, est1rm, unit } }
  shared_routine jsonb,                             -- opt-in copy of routine, read-only to others
  shared_targets jsonb,                             -- opt-in copy of targets (goal 1RMs), forked alongside routine
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create index if not exists profiles_public_idx on profiles (user_id) where is_public = true;

alter table profiles enable row level security;

-- read: yourself always; others only if their profile is public
create policy "profiles read self or public"
  on profiles for select
  using (user_id = auth.uid() or is_public = true);

-- write: only your own row
create policy "profiles write own"
  on profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------
-- friendships: mutual, one canonical row per pair (user_a < user_b)
-- ---------------------------------------------------------------
do $$ begin
  create type friend_status as enum ('pending', 'accepted');
exception when duplicate_object then null; end $$;

create table if not exists friendships (
  user_a        uuid not null references auth.users on delete cascade,
  user_b        uuid not null references auth.users on delete cascade,
  status        friend_status not null default 'pending',
  requested_by  uuid not null references auth.users on delete cascade,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  primary key (user_a, user_b),
  constraint friendships_canonical check (user_a < user_b)
);

create index if not exists friendships_user_b_idx on friendships (user_b);

alter table friendships enable row level security;

-- see rows you are part of
create policy "friendships read own"
  on friendships for select
  using (auth.uid() in (user_a, user_b));

-- create a request: you must be a participant and the requester
create policy "friendships insert own request"
  on friendships for insert
  with check (auth.uid() in (user_a, user_b) and auth.uid() = requested_by);

-- accept / modify: confined to participants
create policy "friendships update participant"
  on friendships for update
  using (auth.uid() in (user_a, user_b))
  with check (auth.uid() in (user_a, user_b));

-- either party can unfriend / cancel
create policy "friendships delete participant"
  on friendships for delete
  using (auth.uid() in (user_a, user_b));

-- Accepted-friendship check. Its only caller is the activities SELECT policy,
-- as is_friend(auth.uid(), actor_id): the viewer is always a participant of the
-- friendship row and can read it under friendships RLS, and friendships policies
-- reference no functions, so there is no recursion. SECURITY INVOKER (the default)
-- keeps it off the REST RPC attack surface.
create or replace function is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and f.user_a = least(a, b)
      and f.user_b = greatest(a, b)
  );
$$;

-- ---------------------------------------------------------------
-- activities: feed items with denormalized SNAPSHOT payloads
-- ---------------------------------------------------------------
do $$ begin
  create type activity_type as enum (
    'workout_completed', 'week_completed', 'pr_set', 'program_forked', 'joined'
  );
exception when duplicate_object then null; end $$;

create table if not exists activities (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users on delete cascade,
  type        activity_type not null,
  payload     jsonb not null default '{}',
  visibility  text not null default 'friends' check (visibility in ('friends', 'public')),
  created_at  timestamptz not null default now()
);

create index if not exists activities_actor_created_idx on activities (actor_id, created_at desc);
create index if not exists activities_created_idx on activities (created_at desc);
-- De-dupe guard: at most one workout_completed per actor per (week, day).
create unique index if not exists activities_workout_unique
  on activities (actor_id, (payload->>'week'), (payload->>'day'))
  where type = 'workout_completed';

alter table activities enable row level security;

-- read: self; public activities of public profiles; friends-visible activities of accepted friends
create policy "activities read visible"
  on activities for select
  using (
    actor_id = auth.uid()
    or (visibility = 'public'
        and exists (select 1 from profiles p where p.user_id = actor_id and p.is_public))
    or (visibility = 'friends' and is_friend(auth.uid(), actor_id))
  );

create policy "activities write own"
  on activities for all
  using (actor_id = auth.uid())
  with check (actor_id = auth.uid());

-- ---------------------------------------------------------------
-- kudos + comments: visibility inherited from the parent activity
-- (the exists() subquery is itself subject to activities RLS)
-- ---------------------------------------------------------------
create table if not exists kudos (
  activity_id uuid not null references activities on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create index if not exists kudos_activity_idx on kudos (activity_id);

alter table kudos enable row level security;

create policy "kudos read if activity visible"
  on kudos for select
  using (exists (select 1 from activities a where a.id = activity_id));

create policy "kudos write own"
  on kudos for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities on delete cascade,
  author_id   uuid not null references auth.users on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists comments_activity_idx on comments (activity_id, created_at);

alter table comments enable row level security;

create policy "comments read if activity visible"
  on comments for select
  using (exists (select 1 from activities a where a.id = activity_id));

create policy "comments insert own"
  on comments for insert
  with check (author_id = auth.uid());

create policy "comments modify own"
  on comments for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ---------------------------------------------------------------
-- avatars storage bucket: public read, owner-only write
-- path convention: avatars/{user_id}/{filename}
-- A public bucket serves objects via their public URL without any SELECT
-- policy on storage.objects, so we add none (a broad SELECT policy would only
-- enable listing every file, which avatars don't need). Writes are owner-only.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy "users upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
